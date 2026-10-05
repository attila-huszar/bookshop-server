import { beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { rejects } from 'node:assert/strict'
import type { Order, OrderUpdate, StripePaymentIntent } from '@/types'
import {
  mockCancelAdminPaymentErrorAlert,
  mockEnqueueEmail,
  mockExtractPaymentIntentFields,
  mockLogger,
  mockOrdersDB,
  mockStripe,
} from './test-setup'

const { reconcileOrderPayment } = await import('@/services/orders.service')
const { reconcileStaleOrders } =
  await import('@/services/order-reconciliation.service')

function createOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 1,
    checkoutRequestId: 'checkout-reconciliation-test',
    paymentId: 'pi_test',
    paymentStatus: 'processing',
    lastStripeEventCreated: 100,
    lastStripeEventId: 'evt_previous',
    lastReconciledAt: null,
    lastReconciliationAttemptAt: null,
    paidAt: null,
    total: 12.34,
    currency: 'USD',
    items: [],
    firstName: null,
    lastName: null,
    email: 'guest@example.com',
    shipping: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

function createIntent(
  overrides: Partial<StripePaymentIntent> = {},
): StripePaymentIntent {
  return {
    id: 'pi_test',
    amount: 1234,
    currency: 'usd',
    status: 'succeeded',
    metadata: { orderId: '1' },
    ...overrides,
  } as StripePaymentIntent
}

describe('Order reconciliation', () => {
  beforeEach(() => {
    mockOrdersDB.getOrder.mockReset()
    mockOrdersDB.getOrderById.mockReset()
    mockOrdersDB.getOrdersForReconciliation.mockReset()
    mockOrdersDB.markUnlinkedOrderReconciled.mockReset()
    mockOrdersDB.markOrderReconciliationAttempted.mockReset()
    mockOrdersDB.linkPaymentIntent.mockReset()
    mockOrdersDB.updateOrder.mockReset()
    mockOrdersDB.updateOrderIfUnchanged.mockClear()
    mockStripe.paymentIntents.retrieve.mockReset()
    mockStripe.paymentIntents.search.mockReset()
    mockStripe.paymentIntents.create.mockReset()
    mockEnqueueEmail.mockReset()
    mockCancelAdminPaymentErrorAlert.mockReset()
    mockCancelAdminPaymentErrorAlert.mockResolvedValue(false)
    mockExtractPaymentIntentFields.mockReset()
    mockExtractPaymentIntentFields.mockReturnValue({})
    mockLogger.error.mockReset()
    mockLogger.info.mockReset()
    mockOrdersDB.getOrderById.mockResolvedValue(createOrder())
    mockStripe.paymentIntents.retrieve.mockResolvedValue(createIntent())
    mockOrdersDB.updateOrder.mockImplementation(
      (_paymentId: string, fields: OrderUpdate) => {
        const order = createOrder(fields)
        return Promise.resolve({
          order,
          becamePaid: fields.paidAt instanceof Date,
        })
      },
    )
  })

  it('repairs a missed success and shares first-paid notifications with webhooks', async () => {
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'receipt@example.com',
    })
    await reconcileOrderPayment(1)

    const fields = mockOrdersDB.updateOrder.mock.calls[0]?.[1] as OrderUpdate
    expect(fields).toMatchObject({
      paymentStatus: 'succeeded',
      email: 'guest@example.com',
    })
    expect(fields.paidAt).toBeInstanceOf(Date)
    expect(fields.lastReconciledAt).toBeInstanceOf(Date)
    expect(fields).not.toHaveProperty('lastStripeEventCreated')
    expect(fields).not.toHaveProperty('lastStripeEventId')
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(2)
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      'orderConfirmation',
      expect.any(Object),
    )
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      'adminPaymentNotification',
      expect.objectContaining({ notificationType: 'confirmed' }),
    )
    expect(mockCancelAdminPaymentErrorAlert).toHaveBeenCalledWith('pi_test')
  })

  it('does not resend confirmations for an already paid order', async () => {
    const paid = createOrder({
      paymentStatus: 'succeeded',
      paidAt: new Date('2026-01-02'),
    })
    mockOrdersDB.getOrderById.mockResolvedValue(paid)
    mockOrdersDB.updateOrder.mockResolvedValue({
      order: paid,
      becamePaid: false,
    })
    await reconcileOrderPayment(1)
    expect(mockOrdersDB.updateOrder.mock.calls[0]?.[1]).not.toHaveProperty(
      'paidAt',
    )
    expect(mockEnqueueEmail).not.toHaveBeenCalled()
  })

  it.each([
    'requires_payment_method',
    'requires_action',
    'requires_confirmation',
    'requires_capture',
    'processing',
    'canceled',
  ] as const)(
    'mirrors %s without imposing a linear Stripe status progression',
    async (status) => {
      mockStripe.paymentIntents.retrieve.mockResolvedValue(
        createIntent({ status }),
      )
      await reconcileOrderPayment(1)
      expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
        'pi_test',
        expect.objectContaining({ paymentStatus: status }),
      )
      expect(mockOrdersDB.updateOrder.mock.calls[0]?.[1]).not.toHaveProperty(
        'paidAt',
      )
      expect(mockEnqueueEmail).not.toHaveBeenCalled()
    },
  )

  it('repairs a terminal-looking local status when the order has not been marked paid', async () => {
    mockOrdersDB.getOrderById.mockResolvedValue(
      createOrder({ paymentStatus: 'canceled' }),
    )
    await reconcileOrderPayment(1)
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(2)
  })

  it('fills a missing guest email from Stripe', async () => {
    mockOrdersDB.getOrderById.mockResolvedValue(createOrder({ email: null }))
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'guest-receipt@example.com',
    })
    await reconcileOrderPayment(1)
    expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
      'pi_test',
      expect.objectContaining({ email: 'guest-receipt@example.com' }),
    )
  })

  it.each([
    { amount: 999 },
    { currency: 'eur' },
    { metadata: { orderId: '2' } },
    { id: 'pi_other' },
  ])('rejects mismatched payments: %j', async (overrides) => {
    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      createIntent(overrides),
    )
    await rejects(reconcileOrderPayment(1))
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(mockEnqueueEmail).not.toHaveBeenCalled()
  })

  it('never downgrades an already paid order', async () => {
    mockOrdersDB.getOrderById.mockResolvedValue(
      createOrder({ paymentStatus: 'succeeded', paidAt: new Date() }),
    )
    mockStripe.paymentIntents.retrieve.mockResolvedValue(
      createIntent({ status: 'processing' }),
    )
    await rejects(reconcileOrderPayment(1), /Refusing to downgrade/)
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
  })

  it('recovers an unlinked draft by metadata, then re-reads the linked order and Stripe intent', async () => {
    const draft = createOrder({ paymentId: null })
    mockOrdersDB.getOrderById
      .mockResolvedValueOnce(draft)
      .mockResolvedValue(createOrder())
    mockOrdersDB.getOrder.mockResolvedValueOnce(null)
    mockStripe.paymentIntents.search.mockResolvedValueOnce({
      data: [createIntent()],
      has_more: false,
    })
    mockOrdersDB.linkPaymentIntent.mockResolvedValueOnce({
      order: createOrder(),
      linked: true,
    })

    await reconcileOrderPayment(1)
    expect(mockStripe.paymentIntents.search).toHaveBeenCalledWith(
      { query: "metadata['orderId']:'1'", limit: 2 },
      expect.any(Object),
    )
    expect(mockOrdersDB.linkPaymentIntent).toHaveBeenCalledWith(
      1,
      'pi_test',
      'succeeded',
    )
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(2)
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(3)
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('leaves unmatched drafts for a later check without creating a replacement payment', async () => {
    mockOrdersDB.getOrderById.mockResolvedValue(
      createOrder({ paymentId: null }),
    )
    mockStripe.paymentIntents.search.mockResolvedValue({
      data: [],
      has_more: false,
    })
    await reconcileOrderPayment(1)
    expect(mockOrdersDB.markUnlinkedOrderReconciled).toHaveBeenCalledWith(
      1,
      expect.any(Date),
    )
    expect(mockOrdersDB.linkPaymentIntent).not.toHaveBeenCalled()
    expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    expect(mockStripe.paymentIntents.create).not.toHaveBeenCalled()
  })

  it('refuses ambiguous metadata matches', async () => {
    mockOrdersDB.getOrderById.mockResolvedValue(
      createOrder({ paymentId: null }),
    )
    mockStripe.paymentIntents.search.mockResolvedValue({
      data: [createIntent(), createIntent({ id: 'pi_other' })],
      has_more: false,
    })
    await rejects(reconcileOrderPayment(1), /Multiple Stripe payments/)
    expect(mockOrdersDB.linkPaymentIntent).not.toHaveBeenCalled()
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
  })

  it('re-fetches Stripe after a concurrent webhook wins the conditional update', async () => {
    const paid = createOrder({
      paymentStatus: 'succeeded',
      paidAt: new Date(),
      lastStripeEventId: 'evt_race',
    })
    mockOrdersDB.getOrderById
      .mockResolvedValueOnce(createOrder())
      .mockResolvedValue(paid)
    mockStripe.paymentIntents.retrieve
      .mockResolvedValueOnce(createIntent({ status: 'requires_action' }))
      .mockResolvedValue(createIntent())
    mockOrdersDB.updateOrder
      .mockResolvedValueOnce({ order: null, becamePaid: false })
      .mockResolvedValue({ order: paid, becamePaid: false })
    await reconcileOrderPayment(1)
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(2)
    expect(mockOrdersDB.updateOrder).toHaveBeenLastCalledWith(
      'pi_test',
      expect.objectContaining({ paymentStatus: 'succeeded' }),
    )
    expect(mockEnqueueEmail).not.toHaveBeenCalled()
  })

  it('bounds retries when concurrent writes keep winning', async () => {
    mockOrdersDB.updateOrder.mockResolvedValue({
      order: null,
      becamePaid: false,
    })
    await rejects(reconcileOrderPayment(1), /Concurrent updates/)
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(5)
  })

  it('continues after an individual Stripe failure and reports failed checks', async () => {
    const second = createOrder({ id: 2, paymentId: 'pi_second' })
    mockOrdersDB.getOrdersForReconciliation.mockResolvedValue([
      createOrder(),
      second,
    ])
    mockOrdersDB.getOrderById
      .mockResolvedValueOnce(createOrder())
      .mockResolvedValue(second)
    mockStripe.paymentIntents.retrieve
      .mockRejectedValueOnce(new Error('Stripe unavailable'))
      .mockResolvedValue(
        createIntent({ id: 'pi_second', metadata: { orderId: '2' } }),
      )
    const startedAt = Date.now()
    expect(await reconcileStaleOrders()).toEqual({ checked: 2, failed: 1 })
    const query = mockOrdersDB.getOrdersForReconciliation.mock
      .calls[0]?.[0] as {
      staleBefore: Date
      checkedBefore: Date
      terminalCheckedBefore: Date
      limit: number
    }
    expect(query.staleBefore.getTime()).toBeGreaterThanOrEqual(
      startedAt - 5 * 60_000,
    )
    expect(query.checkedBefore.getTime()).toBeGreaterThanOrEqual(
      startedAt - 30 * 60_000,
    )
    expect(query.terminalCheckedBefore.getTime()).toBeGreaterThanOrEqual(
      startedAt - 24 * 60 * 60_000,
    )
    expect(query.limit).toBe(100)
    expect(mockOrdersDB.updateOrder).toHaveBeenCalledTimes(1)
    expect(mockOrdersDB.markOrderReconciliationAttempted).toHaveBeenCalledTimes(
      2,
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[STRIPE] Order reconciliation failed',
      expect.objectContaining({ orderId: 1, paymentId: 'pi_test' }),
    )
  })

  it('skips orders deleted after selection', async () => {
    mockOrdersDB.getOrderById.mockResolvedValue(null)
    await reconcileOrderPayment(1)
    expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('leaves remaining checks for the next run when its time budget expires', async () => {
    mockOrdersDB.getOrdersForReconciliation.mockResolvedValue([createOrder()])
    const clock = spyOn(Date, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValue(8 * 60_000)
    try {
      expect(await reconcileStaleOrders()).toEqual({ checked: 0, failed: 0 })
      expect(
        mockOrdersDB.markOrderReconciliationAttempted,
      ).not.toHaveBeenCalled()
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    } finally {
      clock.mockRestore()
    }
  })
})
