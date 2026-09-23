import { beforeEach, describe, expect, it } from 'bun:test'
import { BadRequest } from '@/errors/BadRequest'
import { Internal } from '@/errors/Internal'
import { Unauthorized } from '@/errors/Unauthorized'
import type { Order } from '@/types'
import {
  mockBooksDB,
  mockEnqueueEmail,
  mockLogger,
  mockOrdersDB,
  mockStripe,
  mockValidate,
} from './test-setup'

const { cancelPaymentIntent, retrievePaymentIntent, startCheckoutPayment } =
  await import('@/services/payments.service')

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'processing',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  paidAt: null,
  total: 12.34,
  currency: 'USD',
  items: [],
  firstName: 'Guest',
  lastName: 'User',
  email: 'guest@example.com',
  shipping: null,
  createdAt: new Date('2026-02-24T10:00:00.000Z'),
  updatedAt: new Date('2026-02-24T10:05:00.000Z'),
  ...overrides,
})

describe('Payments Service', () => {
  beforeEach(() => {
    mockValidate.mockReset()
    mockBooksDB.getBookById.mockReset()
    mockOrdersDB.getOrder.mockReset()
    mockOrdersDB.getOrderById.mockReset()
    mockOrdersDB.createOrder.mockReset()
    mockOrdersDB.linkPaymentIntent.mockReset()
    mockOrdersDB.updateOrder.mockReset()
    mockOrdersDB.deleteOrderById.mockReset()
    mockStripe.paymentIntents.create.mockReset()
    mockStripe.paymentIntents.retrieve.mockReset()
    mockStripe.paymentIntents.cancel.mockReset()
    mockEnqueueEmail.mockReset()
    mockLogger.error.mockReset()
    mockValidate.mockReturnValue('pi_test_123')
  })

  it('creates and links a draft order before returning a payment intent', async () => {
    const draftOrder = createOrder({ paymentId: null })
    const linkedOrder = createOrder()
    mockValidate
      .mockReturnValueOnce({
        items: [{ id: 1, quantity: 1 }],
        expectedTotal: 12.34,
      })
      .mockReturnValueOnce({})
    mockBooksDB.getBookById.mockResolvedValueOnce({
      id: 1,
      title: 'Sample Book',
      author: 'Sample Author',
      imgUrl: '',
      price: 12.34,
      discount: 0,
    })
    mockOrdersDB.createOrder.mockResolvedValueOnce(draftOrder)
    mockStripe.paymentIntents.create.mockResolvedValueOnce({
      id: 'pi_test_123',
      status: 'requires_payment_method',
      client_secret: 'pi_test_secret',
      metadata: { orderId: '1' },
    })
    mockOrdersDB.getOrderById.mockResolvedValueOnce(draftOrder)
    mockOrdersDB.linkPaymentIntent.mockResolvedValueOnce({
      order: linkedOrder,
      linked: true,
    })

    const result = await startCheckoutPayment(
      { items: [{ id: 1, quantity: 1 }], expectedTotal: 12.34 },
      null,
      'req_test_123',
    )

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { orderId: '1', requestId: 'req_test_123' },
      }),
      { idempotencyKey: 'req_test_123' },
    )
    expect(mockOrdersDB.linkPaymentIntent).toHaveBeenCalledWith(
      1,
      'pi_test_123',
      'requires_payment_method',
    )
    expect(result).toEqual({
      paymentId: 'pi_test_123',
      paymentToken: 'pi_test_secret',
      amount: 1234,
    })
  })

  it('does not create a Stripe intent if it cannot create the draft order', async () => {
    mockValidate
      .mockReturnValueOnce({
        items: [{ id: 1, quantity: 1 }],
        expectedTotal: 12.34,
      })
      .mockReturnValueOnce({})
    mockBooksDB.getBookById.mockResolvedValueOnce({
      id: 1,
      title: 'Sample Book',
      author: 'Sample Author',
      imgUrl: '',
      price: 12.34,
      discount: 0,
    })
    mockOrdersDB.createOrder.mockResolvedValueOnce(null)

    let error: unknown
    try {
      await startCheckoutPayment(
        { items: [{ id: 1, quantity: 1 }], expectedTotal: 12.34 },
        null,
        'req_test_123',
      )
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(Internal)
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('deletes a draft order when Stripe payment intent creation fails', async () => {
    const draftOrder = createOrder({ paymentId: null })
    mockValidate
      .mockReturnValueOnce({
        items: [{ id: 1, quantity: 1 }],
        expectedTotal: 12.34,
      })
      .mockReturnValueOnce({})
    mockBooksDB.getBookById.mockResolvedValueOnce({
      id: 1,
      title: 'Sample Book',
      author: 'Sample Author',
      imgUrl: '',
      price: 12.34,
      discount: 0,
    })
    mockOrdersDB.createOrder.mockResolvedValueOnce(draftOrder)
    mockOrdersDB.deleteOrderById.mockResolvedValueOnce(draftOrder)
    const stripeError = new Error('Stripe unavailable')
    mockStripe.paymentIntents.create.mockRejectedValueOnce(stripeError)

    let error: unknown
    try {
      await startCheckoutPayment(
        { items: [{ id: 1, quantity: 1 }], expectedTotal: 12.34 },
        null,
        'req_test_123',
      )
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBe(stripeError)
    expect(mockOrdersDB.deleteOrderById).toHaveBeenCalledWith(draftOrder.id)
  })

  it('creates a replacement intent when an idempotent replay is canceled', async () => {
    const draftOrder = createOrder({ paymentId: null })
    mockValidate
      .mockReturnValueOnce({
        items: [{ id: 1, quantity: 1 }],
        expectedTotal: 12.34,
      })
      .mockReturnValueOnce({})
    mockBooksDB.getBookById.mockResolvedValueOnce({
      id: 1,
      title: 'Sample Book',
      author: 'Sample Author',
      imgUrl: '',
      price: 12.34,
      discount: 0,
    })
    mockOrdersDB.createOrder.mockResolvedValueOnce(draftOrder)
    mockStripe.paymentIntents.create
      .mockResolvedValueOnce({
        id: 'pi_canceled',
        status: 'canceled',
        client_secret: 'pi_canceled_secret',
        metadata: { orderId: '1' },
      })
      .mockResolvedValueOnce({
        id: 'pi_replacement',
        status: 'requires_payment_method',
        client_secret: 'pi_replacement_secret',
        metadata: { orderId: '1' },
      })
    mockOrdersDB.getOrderById.mockResolvedValueOnce(draftOrder)
    mockOrdersDB.linkPaymentIntent.mockResolvedValueOnce({
      order: createOrder({ paymentId: 'pi_replacement' }),
      linked: true,
    })

    const result = await startCheckoutPayment(
      { items: [{ id: 1, quantity: 1 }], expectedTotal: 12.34 },
      null,
      'req_test_123',
    )

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(2)
    expect(mockStripe.paymentIntents.create).toHaveBeenLastCalledWith(
      expect.anything(),
      { idempotencyKey: 'req_test_123:recovery' },
    )
    expect(result.paymentId).toBe('pi_replacement')
  })

  it('rejects unauthorized payment retrieval before contacting Stripe', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(createOrder())

    let error: unknown
    try {
      await retrievePaymentIntent('pi_test_123', {
        userEmail: 'other@example.com',
      })
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(Unauthorized)
    expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('delegates cancellation to Stripe without changing the persisted order', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(createOrder())
    mockStripe.paymentIntents.cancel.mockResolvedValueOnce({
      id: 'pi_test_123',
      status: 'canceled',
    })
    const result = await cancelPaymentIntent('pi_test_123', {
      paymentSessionId: 'pi_test_123',
    })

    expect(result.status).toBe('canceled')
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
  })

  it('does not cancel an already successful payment', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({ paymentStatus: 'succeeded' }),
    )

    let error: unknown
    try {
      await cancelPaymentIntent('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })
    } catch (caughtError) {
      error = caughtError
    }

    expect(error).toBeInstanceOf(BadRequest)
    expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled()
  })
})
