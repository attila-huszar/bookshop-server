import { beforeEach, describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { BadRequest } from '@/errors/BadRequest'
import { Internal } from '@/errors/Internal'
import { Unauthorized } from '@/errors/Unauthorized'
import type { Order, OrderInsert, PublicUser } from '@/types'
import {
  mockBooksDB,
  mockEnqueueEmail,
  mockOrdersDB,
  mockStripe,
  mockValidate,
} from './test-setup'

const { cancelPaymentIntent, retrievePaymentIntent, startCheckoutPayment } =
  await import('@/services/payments.service')

const request = { items: [{ id: 1, quantity: 1 }], expectedTotal: 12.34 }
const checkoutRequestId = 'req_test_123'
const createOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 1,
  checkoutRequestId,
  paymentId: null,
  paymentStatus: 'processing',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  paidAt: null,
  total: 12.34,
  currency: 'USD',
  items: [],
  firstName: null,
  lastName: null,
  email: null,
  shipping: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})
const paymentIntent = {
  id: 'pi_test_123',
  status: 'requires_payment_method',
  amount: 1234,
  client_secret: 'pi_test_secret',
  metadata: { orderId: '1' },
}

describe('Payments Service', () => {
  beforeEach(() => {
    mockValidate
      .mockReset()
      .mockImplementation((_schema: unknown, value: unknown) => value)
    mockBooksDB.getBookById.mockReset().mockResolvedValue({
      id: 1,
      title: 'Sample Book',
      author: 'Sample Author',
      imgUrl: '',
      price: 12.34,
      discount: 0,
    })
    mockOrdersDB.getOrder.mockReset()
    mockOrdersDB.getOrderByCheckoutRequestId.mockReset().mockResolvedValue(null)
    mockOrdersDB.createCheckoutOrder
      .mockReset()
      .mockResolvedValue(createOrder())
    mockOrdersDB.linkPaymentIntent.mockReset().mockResolvedValue({
      order: createOrder({ paymentId: paymentIntent.id }),
      linked: true,
    })
    mockOrdersDB.updateOrder.mockReset()
    mockStripe.paymentIntents.create
      .mockReset()
      .mockResolvedValue(paymentIntent)
    mockStripe.paymentIntents.retrieve
      .mockReset()
      .mockResolvedValue(paymentIntent)
    mockStripe.paymentIntents.cancel.mockReset()
    mockEnqueueEmail.mockReset()
  })

  it('creates and links a guest draft without requiring an account or email', async () => {
    const result = await startCheckoutPayment(request, null, checkoutRequestId)
    expect(mockValidate.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ checkoutRequestId }),
    )
    expect(mockOrdersDB.createCheckoutOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutRequestId,
        paymentId: null,
        total: 12.34,
      }),
    )
    const createdDraft = mockOrdersDB.createCheckoutOrder.mock
      .calls[0]?.[0] as OrderInsert
    expect(createdDraft.email).toBeUndefined()
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 1234,
        currency: 'usd',
        metadata: { orderId: '1' },
      },
      { idempotencyKey: checkoutRequestId },
    )
    expect(mockOrdersDB.linkPaymentIntent).toHaveBeenCalledWith(
      1,
      paymentIntent.id,
      'requires_payment_method',
    )
    expect(result).toEqual({
      paymentId: paymentIntent.id,
      paymentToken: 'pi_test_secret',
      amount: 1234,
    })
  })

  it('preserves account details without making Stripe parameters depend on them', async () => {
    const user = {
      email: 'account@example.com',
      firstName: 'Account',
      lastName: 'User',
    } as PublicUser
    await startCheckoutPayment(request, user, checkoutRequestId)
    expect(mockOrdersDB.createCheckoutOrder).toHaveBeenCalledWith(
      expect.objectContaining({ email: user.email }),
    )
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { orderId: '1' } }),
      expect.anything(),
    )
  })

  it('does not contact Stripe if draft creation fails', async () => {
    mockOrdersDB.createCheckoutOrder.mockResolvedValueOnce(null)
    await rejects(
      startCheckoutPayment(request, null, checkoutRequestId),
      Internal,
    )
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('rejects a price conflict before storing a new draft', async () => {
    mockBooksDB.getBookById.mockResolvedValueOnce({
      id: 1,
      title: 'Book',
      price: 20,
    })
    await rejects(
      startCheckoutPayment(request, null, checkoutRequestId),
      BadRequest,
    )
    expect(mockOrdersDB.createCheckoutOrder).not.toHaveBeenCalled()
  })

  it('retries a lost Stripe response with exactly the same draft and parameters', async () => {
    const error = new Error('Connection lost after Stripe created the intent')
    mockStripe.paymentIntents.create.mockRejectedValueOnce(error)
    await rejects(startCheckoutPayment(request, null, checkoutRequestId), error)
    const firstCall = mockStripe.paymentIntents.create.mock.calls[0]
    mockOrdersDB.getOrderByCheckoutRequestId.mockResolvedValueOnce(
      createOrder(),
    )
    mockBooksDB.getBookById.mockClear()
    const result = await startCheckoutPayment(request, null, checkoutRequestId)
    expect(mockStripe.paymentIntents.create.mock.calls[1]).toEqual(firstCall)
    expect(mockOrdersDB.createCheckoutOrder).toHaveBeenCalledTimes(1)
    expect(mockBooksDB.getBookById).not.toHaveBeenCalled()
    expect(result.paymentId).toBe(paymentIntent.id)
  })

  it('recovers a response failure after the webhook has linked the order', async () => {
    mockStripe.paymentIntents.create.mockImplementationOnce(() => {
      mockOrdersDB.getOrderByCheckoutRequestId.mockResolvedValue(
        createOrder({ paymentId: paymentIntent.id }),
      )
      return Promise.reject(new Error('Response lost'))
    })
    await rejects(startCheckoutPayment(request, null, checkoutRequestId), {
      message: 'Response lost',
    })
    mockOrdersDB.linkPaymentIntent.mockResolvedValueOnce({
      order: createOrder({ paymentId: paymentIntent.id }),
      linked: false,
    })
    await startCheckoutPayment(request, null, checkoutRequestId)
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(1)
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      paymentIntent.id,
    )
    expect(mockOrdersDB.createCheckoutOrder).toHaveBeenCalledTimes(1)
    expect(mockEnqueueEmail).not.toHaveBeenCalled()
  })

  it('uses the winning draft snapshot when concurrent creates share a request key', async () => {
    mockOrdersDB.createCheckoutOrder.mockResolvedValueOnce(
      createOrder({ id: 42, total: 11 }),
    )
    await startCheckoutPayment(request, null, checkoutRequestId)
    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      {
        amount: 1100,
        currency: 'usd',
        metadata: { orderId: '42' },
      },
      { idempotencyKey: checkoutRequestId },
    )
  })

  it('requires a new checkout for a canceled intent instead of replacing the linked intent', async () => {
    mockOrdersDB.getOrderByCheckoutRequestId.mockResolvedValueOnce(
      createOrder({ paymentId: paymentIntent.id }),
    )
    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      ...paymentIntent,
      status: 'canceled',
    })
    await rejects(startCheckoutPayment(request, null, checkoutRequestId), {
      status: 410,
    })
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('rejects unauthorized retrieval before contacting Stripe', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({ email: 'owner@example.com' }),
    )
    await rejects(
      retrievePaymentIntent(paymentIntent.id, {
        userEmail: 'other@example.com',
      }),
      Unauthorized,
    )
    expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('allows a guest to retrieve their payment using only the signed session', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({ paymentId: paymentIntent.id }),
    )
    await retrievePaymentIntent(paymentIntent.id, {
      cookiePaymentId: paymentIntent.id,
    })
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      paymentIntent.id,
    )
  })

  it('delegates guest cancellation to Stripe without changing the persisted order', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({ paymentId: paymentIntent.id }),
    )
    mockStripe.paymentIntents.cancel.mockResolvedValueOnce({
      id: paymentIntent.id,
      status: 'canceled',
    })
    const result = await cancelPaymentIntent(paymentIntent.id, {
      cookiePaymentId: paymentIntent.id,
    })
    expect(result.status).toBe('canceled')
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
  })

  it('does not cancel an already successful payment', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({ paymentStatus: 'succeeded' }),
    )
    await rejects(
      cancelPaymentIntent(paymentIntent.id, {
        cookiePaymentId: paymentIntent.id,
      }),
      BadRequest,
    )
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled()
  })
})
