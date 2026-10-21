import { beforeEach, describe, expect, it } from 'bun:test'
import {
  IssueCode,
  type Order,
  type PaymentIntentStatus,
  type StripePaymentIntent,
} from '@/types'
import {
  mockExtractPaymentIntentFields,
  mockLogger,
  mockOrdersDB,
  mockStripe,
} from './test-setup'

const { verifyAndHandleStripeWebhook } =
  await import('@/services/webhooks.service')
const { applyPaymentIntentWebhookToOrder } =
  await import('@/services/orders.service')

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  checkoutRequestId: 'checkout-webhook-test',
  termsAcceptance: null,
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'processing',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastReconciledAt: null,
  reconciliationFailures: 0,
  reconciliationAlertId: null,
  lastReconciliationAttemptAt: null,
  paidAt: null,
  total: 25.99,
  currency: 'USD',
  items: [],
  firstName: 'Guest',
  lastName: 'User',
  email: 'guest@example.com',
  shipping: null,
  createdAt: new Date('2026-02-24T10:00:00.000Z'),
  updatedAt: new Date('2026-02-24T10:05:00.000Z'),
  deletedAt: null,
  ...overrides,
})

const createStripePaymentIntent = (
  orderId?: string,
  status: PaymentIntentStatus = 'processing',
): StripePaymentIntent =>
  ({
    id: 'pi_test_123',
    status,
    metadata: orderId
      ? { orderId, checkoutRequestId: 'checkout-webhook-test' }
      : {},
    amount: 2599,
    currency: 'usd',
  }) as unknown as StripePaymentIntent

function createPaymentIntentEvent({
  eventId,
  eventCreated,
  type,
  status,
}: {
  eventId: string
  eventCreated: number
  type: string
  status: PaymentIntentStatus
}) {
  return {
    id: eventId,
    object: 'event',
    created: eventCreated,
    type,
    livemode: false,
    pending_webhooks: 1,
    request: {
      id: null,
      idempotency_key: null,
    },
    data: {
      object: {
        id: 'pi_test_123',
        object: 'payment_intent',
        metadata: { orderId: '1', checkoutRequestId: 'checkout-webhook-test' },
        status,
        amount: 2599,
        currency: 'usd',
        receipt_email: 'buyer@example.com',
        shipping: null,
        last_payment_error: null,
      },
    },
  } as const
}

function mockWebhookRequest(event: unknown) {
  // Signature verification belongs to Stripe; these tests exercise our handler.
  mockStripe.webhooks.constructEventAsync.mockResolvedValueOnce(event)

  return { payload: JSON.stringify(event), signature: 'test-signature' }
}

describe('Webhooks Service', () => {
  beforeEach(() => {
    mockOrdersDB.recordReconciliationFailure.mockReset()
    mockOrdersDB.getOrderById.mockReset().mockResolvedValue(null)
    mockOrdersDB.getOrder.mockReset()
    mockOrdersDB.linkPaymentIntent.mockReset()
    mockOrdersDB.updateOrder.mockReset()
    mockStripe.webhooks.constructEventAsync.mockReset()
    mockStripe.paymentIntents.retrieve.mockReset()
    mockLogger.info.mockReset()
    mockLogger.warn.mockReset()
    mockLogger.error.mockReset()
    mockExtractPaymentIntentFields.mockReset()
    mockExtractPaymentIntentFields.mockReturnValue({})
  })

  it('checks a delayed pre-reconciliation transition against Stripe before saving', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'requires_payment_method',
        lastStripeEventCreated: 100,
        lastReconciledAt: new Date(250_000),
      }),
    )
    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      status: 'requires_payment_method',
    })
    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(undefined, 'processing'),
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventCreated: 200,
        eventId: 'evt_delayed',
      },
    )

    expect(result?.paymentStatus).toBe('requires_payment_method')
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      'pi_test_123',
    )
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
  })

  it('still accepts a genuinely newer event after reconciliation', async () => {
    const order = createOrder({
      paymentStatus: 'requires_payment_method',
      lastReconciledAt: new Date(250_000),
    })

    mockOrdersDB.getOrder.mockResolvedValueOnce(order)
    mockOrdersDB.updateOrder.mockResolvedValueOnce({
      ...order,
      paymentStatus: 'processing',
    })
    await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(),
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventCreated: 300,
        eventId: 'evt_new',
      },
    )
    expect(mockOrdersDB.updateOrder).toHaveBeenCalledTimes(1)
    expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
  })

  it('acknowledges charge events without handling or updating orders', async () => {
    const event = {
      id: 'evt_charge_refunded',
      created: 404,
      type: 'charge.refunded',
      data: { object: { id: 'ch_test_123', object: 'charge' } },
    }
    const { payload, signature } = mockWebhookRequest(event)

    expect(await verifyAndHandleStripeWebhook(payload, signature)).toEqual({
      received: true,
    })
    expect(mockOrdersDB.getOrder).not.toHaveBeenCalled()
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
    expect(mockLogger.info).not.toHaveBeenCalled()
    expect(mockLogger.warn).not.toHaveBeenCalled()
  })

  it('logs unknown PaymentIntent events without updating orders', async () => {
    const event = createPaymentIntentEvent({
      eventId: 'evt_unknown_payment_intent',
      eventCreated: 405,
      type: 'payment_intent.future_event',
      status: 'processing',
    })
    const { payload, signature } = mockWebhookRequest(event)

    expect(await verifyAndHandleStripeWebhook(payload, signature)).toEqual({
      received: true,
    })
    expect(mockOrdersDB.getOrder).not.toHaveBeenCalled()
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[STRIPE] Unhandled webhook event type: payment_intent.future_event',
    )
  })

  it('ignores older webhook events by event.created', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_new',
      }),
    )

    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(),
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_old',
        eventCreated: 199,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
  })

  it('links a draft order using the Stripe metadata before applying the webhook', async () => {
    mockOrdersDB.getOrderById.mockResolvedValueOnce(
      createOrder({ paymentId: null }),
    )
    const linkedOrder = createOrder({ paymentId: 'pi_test_123' })

    mockOrdersDB.getOrder.mockResolvedValueOnce(null)
    mockOrdersDB.linkPaymentIntent.mockResolvedValueOnce(linkedOrder)
    mockOrdersDB.updateOrder.mockResolvedValueOnce(linkedOrder)

    await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent('1'),
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_draft',
        eventCreated: 100,
      },
    )

    expect(mockOrdersDB.linkPaymentIntent).toHaveBeenCalledWith(
      1,
      'pi_test_123',
      'processing',
    )
    expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
      'pi_test_123',
      expect.objectContaining({
        paymentStatus: 'processing',
        lastStripeEventCreated: 100,
        lastStripeEventId: 'evt_draft',
      }),
    )
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
  })

  it('acknowledges unrelated PaymentIntents without creating orders or alerts', async () => {
    const event = createPaymentIntentEvent({
      eventId: 'evt_unrelated',
      eventCreated: 100,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const unrelated = {
      ...event,
      data: { object: { ...event.data.object, metadata: {} } },
    }
    const { payload, signature } = mockWebhookRequest(unrelated)

    expect(await verifyAndHandleStripeWebhook(payload, signature)).toEqual({
      received: true,
    })
    expect(mockOrdersDB.getOrder).not.toHaveBeenCalled()
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
  })

  it('ignores duplicate webhook events in the same second', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_same',
      }),
    )

    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(),
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_same',
        eventCreated: 200,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
  })

  it('ignores a same-second status when Stripe has moved on', async () => {
    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      status: 'processing',
    })
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_newer',
      }),
    )

    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(),
      { paymentStatus: 'requires_action' },
      {
        eventType: 'payment_intent.requires_action',
        eventId: 'evt_older_state',
        eventCreated: 200,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith(
      'pi_test_123',
    )
    expect(result).not.toBeNull()
  })

  it('applies a same-second status when Stripe confirms it', async () => {
    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      status: 'processing',
    })
    const updatedOrder = createOrder({
      paymentStatus: 'processing',
      lastStripeEventCreated: 200,
      lastStripeEventId: 'evt_progress',
    })

    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'requires_action',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_prev',
      }),
    )
    mockOrdersDB.updateOrder.mockResolvedValueOnce(updatedOrder)

    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(),
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_progress',
        eventCreated: 200,
      },
    )

    expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
      'pi_test_123',
      expect.objectContaining({
        paymentStatus: 'processing',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_progress',
      }),
    )
    expect(result).not.toBeNull()
    expect(result?.paymentStatus).toBe('processing')
  })

  it('applies a same-second payment failure when Stripe confirms the new status', async () => {
    mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
      status: 'requires_payment_method',
    })
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'requires_action',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_action',
      }),
    )
    mockOrdersDB.updateOrder.mockResolvedValueOnce(
      createOrder({ paymentStatus: 'requires_payment_method' }),
    )

    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(undefined, 'requires_payment_method'),
      { paymentStatus: 'requires_payment_method' },
      {
        eventType: 'payment_intent.payment_failed',
        eventId: 'evt_failed',
        eventCreated: 200,
      },
    )

    expect(result?.paymentStatus).toBe('requires_payment_method')
    expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
      'pi_test_123',
      expect.objectContaining({ paymentStatus: 'requires_payment_method' }),
    )
  })

  it('propagates a failed Stripe status check without updating the order', async () => {
    mockStripe.paymentIntents.retrieve.mockRejectedValueOnce(
      new Error('Stripe unavailable'),
    )
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'requires_action',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_action',
      }),
    )

    let resultError: unknown = null

    try {
      await applyPaymentIntentWebhookToOrder(
        createStripePaymentIntent(undefined, 'requires_payment_method'),
        { paymentStatus: 'requires_payment_method' },
        {
          eventType: 'payment_intent.payment_failed',
          eventId: 'evt_failed',
          eventCreated: 200,
        },
      )
    } catch (error) {
      resultError = error
    }

    expect(resultError).toMatchObject({ message: 'Stripe unavailable' })
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
  })

  it('sets paidAt and event markers when moving to succeeded', async () => {
    const paidAt = new Date('2026-02-24T10:10:00.000Z')
    const updatedOrder = createOrder({
      paymentStatus: 'succeeded',
      paidAt,
      lastStripeEventCreated: 201,
      lastStripeEventId: 'evt_success',
    })

    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        paidAt: null,
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_prev',
      }),
    )
    mockOrdersDB.updateOrder.mockResolvedValueOnce(updatedOrder)

    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(),
      { paymentStatus: 'succeeded' },
      {
        eventType: 'payment_intent.succeeded',
        eventId: 'evt_success',
        eventCreated: 201,
      },
    )

    expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
      'pi_test_123',
      expect.objectContaining({
        paymentStatus: 'succeeded',
        lastStripeEventCreated: 201,
        lastStripeEventId: 'evt_success',
        paidAt: expect.any(Date) as Date,
      }),
    )
    expect(result).not.toBeNull()
    expect(result?.paidAt).toBeInstanceOf(Date)
  })

  it('preserves an existing order email when Stripe supplies a different receipt email', async () => {
    const existingOrder = createOrder({ email: 'account@example.com' })

    mockOrdersDB.getOrder.mockResolvedValueOnce(existingOrder)
    mockOrdersDB.updateOrder.mockRejectedValueOnce(new Error('save failed'))

    let resultError: unknown = null

    try {
      await applyPaymentIntentWebhookToOrder(
        createStripePaymentIntent(),
        { email: 'link-receipt@example.com', paymentStatus: 'processing' },
        {
          eventType: 'payment_intent.processing',
          eventId: 'evt_email_preserve',
          eventCreated: 205,
        },
      )
    } catch (error) {
      resultError = error
    }

    expect(resultError).toMatchObject({
      status: 500,
      message: 'Failed to save webhook order update',
    })

    expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
      'pi_test_123',
      expect.objectContaining({
        email: 'account@example.com',
      }),
    )
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
  })

  it('ignores terminal status downgrade even for newer events', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'succeeded',
        paidAt: new Date('2026-02-24T10:03:00.000Z'),
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_final',
      }),
    )

    const result = await applyPaymentIntentWebhookToOrder(
      createStripePaymentIntent(),
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_late',
        eventCreated: 201,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
  })

  it('does not log a canceled order transition when the order is already paid', async () => {
    const event = createPaymentIntentEvent({
      eventId: 'evt_stale_cancel',
      eventCreated: 201,
      type: 'payment_intent.canceled',
      status: 'canceled',
    })

    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'succeeded',
        paidAt: new Date('2026-02-24T10:03:00.000Z'),
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_paid',
      }),
    )
    const { payload, signature } = mockWebhookRequest(event)

    expect(await verifyAndHandleStripeWebhook(payload, signature)).toEqual({
      received: true,
    })
    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(mockLogger.info).not.toHaveBeenCalledWith(
      '[STRIPE] Payment canceled via webhook',
      expect.anything(),
    )
  })

  it('throws 500 and leaves reconciliation to maintenance when webhook order update save throws', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        email: null,
      }),
    )
    mockOrdersDB.updateOrder.mockRejectedValueOnce(
      new Error('webhook update failed'),
    )
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'buyer@example.com',
    })

    const event = createPaymentIntentEvent({
      eventId: 'evt_save_failed',
      eventCreated: 401,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = mockWebhookRequest(event)

    let resultError: unknown = null

    try {
      await verifyAndHandleStripeWebhook(payload, signature)
    } catch (error) {
      resultError = error
    }

    expect(resultError).toMatchObject({
      status: 500,
      message: 'Failed to save webhook order update',
    })
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[CRITICAL] Webhook order update save failed',
      expect.objectContaining({
        issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
        saveFailureReason: 'threw',
        entity: 'order',
        operation: 'update',
        paymentId: 'pi_test_123',
        stripeStatus: 'succeeded',
        eventType: 'payment_intent.succeeded',
        eventId: 'evt_save_failed',
        eventCreated: 401,
      }),
    )
  })

  it('throws 500 and leaves reconciliation to maintenance when webhook order update returns null', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        email: null,
      }),
    )
    mockOrdersDB.updateOrder.mockResolvedValueOnce(null)
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'buyer@example.com',
    })

    const event = createPaymentIntentEvent({
      eventId: 'evt_save_returned_null',
      eventCreated: 402,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = mockWebhookRequest(event)

    let resultError: unknown = null

    try {
      await verifyAndHandleStripeWebhook(payload, signature)
    } catch (error) {
      resultError = error
    }

    expect(resultError).toMatchObject({
      status: 500,
      message: 'Failed to save webhook order update',
    })
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[CRITICAL] Webhook order update save failed',
      expect.objectContaining({
        issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
        saveFailureReason: 'returned_null',
        entity: 'order',
        operation: 'update',
        paymentId: 'pi_test_123',
        stripeStatus: 'succeeded',
        eventType: 'payment_intent.succeeded',
        eventId: 'evt_save_returned_null',
        eventCreated: 402,
      }),
    )
  })

  it('sends new-order notifications when webhook marks order as just paid', async () => {
    const updatedOrder = createOrder({
      paymentStatus: 'succeeded',
      paidAt: new Date('2026-02-24T10:10:00.000Z'),
    })

    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        paidAt: null,
      }),
    )
    mockOrdersDB.updateOrder.mockResolvedValueOnce(updatedOrder)

    const event = createPaymentIntentEvent({
      eventId: 'evt_webhook_paid',
      eventCreated: 402,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = mockWebhookRequest(event)

    const result = await verifyAndHandleStripeWebhook(payload, signature)

    expect(result).toEqual({ received: true })
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
  })

  it('does not send new-order notifications for succeeded webhook when order is already paid', async () => {
    const existingOrder = createOrder({
      paymentStatus: 'succeeded',
      paidAt: new Date('2026-02-24T10:03:00.000Z'),
      lastStripeEventCreated: 200,
      lastStripeEventId: 'evt_initial_paid',
    })
    const updatedOrder = createOrder({
      paymentStatus: 'succeeded',
      paidAt: existingOrder.paidAt,
      lastStripeEventCreated: 403,
      lastStripeEventId: 'evt_repeat_success',
    })

    mockOrdersDB.getOrder.mockResolvedValueOnce(existingOrder)
    mockOrdersDB.updateOrder.mockResolvedValueOnce(updatedOrder)

    const event = createPaymentIntentEvent({
      eventId: 'evt_repeat_success',
      eventCreated: 403,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = mockWebhookRequest(event)

    const result = await verifyAndHandleStripeWebhook(payload, signature)

    expect(result).toEqual({ received: true })
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()
    expect(mockOrdersDB.updateOrder).toHaveBeenCalledTimes(1)
    expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
      'pi_test_123',
      expect.not.objectContaining({
        paidAt: expect.any(Date) as Date,
      }),
    )
  })

  it('throws 500, logs the missing order on missing order for payment_intent.succeeded', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(null)
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'buyer@example.com',
      firstName: 'Buyer',
      lastName: 'Example',
    })
    const event = createPaymentIntentEvent({
      eventId: 'evt_missing_success',
      eventCreated: 301,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = mockWebhookRequest(event)

    let resultError: unknown = null

    try {
      await verifyAndHandleStripeWebhook(payload, signature)
    } catch (error) {
      resultError = error
    }

    expect(resultError).toMatchObject({
      status: 500,
      message: 'Missing order for Stripe payment intent: pi_test_123',
    })
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()

    const missingOrderErrorLog = mockLogger.error.mock.calls.find(
      ([message]) =>
        message ===
        '[CRITICAL] Missing order for Stripe payment_intent webhook',
    )

    expect(missingOrderErrorLog).toBeDefined()
    expect(missingOrderErrorLog?.[1]).toMatchObject({
      issueCode: IssueCode.WEBHOOK_MISSING_ORDER,
      paymentId: 'pi_test_123',
      eventType: 'payment_intent.succeeded',
      eventId: 'evt_missing_success',
      eventCreated: 301,
      stripeStatus: 'succeeded',
      amount: 2599,
      currency: 'usd',
      receiptEmail: 'buyer@example.com',
    })
  })

  it('throws 500, logs the missing order on missing order for payment_intent.canceled', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(null)
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'buyer@example.com',
    })
    const event = createPaymentIntentEvent({
      eventId: 'evt_missing_canceled',
      eventCreated: 302,
      type: 'payment_intent.canceled',
      status: 'canceled',
    })
    const { payload, signature } = mockWebhookRequest(event)

    let resultError: unknown = null

    try {
      await verifyAndHandleStripeWebhook(payload, signature)
    } catch (error) {
      resultError = error
    }

    expect(resultError).toMatchObject({
      status: 500,
      message: 'Missing order for Stripe payment intent: pi_test_123',
    })
    expect(mockOrdersDB.recordReconciliationFailure).not.toHaveBeenCalled()

    const missingOrderErrorLog = mockLogger.error.mock.calls.find(
      ([message]) =>
        message ===
        '[CRITICAL] Missing order for Stripe payment_intent webhook',
    )

    expect(missingOrderErrorLog).toBeDefined()
    expect(missingOrderErrorLog?.[1]).toMatchObject({
      issueCode: IssueCode.WEBHOOK_MISSING_ORDER,
      paymentId: 'pi_test_123',
      eventType: 'payment_intent.canceled',
      eventId: 'evt_missing_canceled',
      eventCreated: 302,
      stripeStatus: 'canceled',
      amount: 2599,
      currency: 'usd',
      receiptEmail: 'buyer@example.com',
    })
  })
})
