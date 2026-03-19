import { beforeEach, describe, expect, it } from 'bun:test'
import { env } from '@/config'
import {
  processStripeWebhook,
  updateOrderFromWebhook,
} from '@/services/webhooks.service'
import { Internal } from '@/errors'
import { IssueCode, type Order, type PaymentIntentStatus } from '@/types'
import {
  mockExtractPaymentIntentFields,
  mockLogger,
  mockOrdersDB,
  mockSendEmail,
  mockStripe,
} from './test-setup'

const TEST_WEBHOOK_SECRET = env.stripeWebhookSecret ?? 'whsec_test'
env.stripeWebhookSecret ??= TEST_WEBHOOK_SECRET

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'processing',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastStripeSyncCheckedAt: null,
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
  ...overrides,
})

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

async function createSignedWebhookRequest(event: unknown): Promise<{
  payload: string
  signature: string
}> {
  const payload = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000)

  const { createHmac } = await import('node:crypto')

  const signature = createHmac('sha256', TEST_WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex')

  return {
    payload,
    signature: `t=${timestamp},v1=${signature}`,
  }
}

describe('Webhooks Service', () => {
  beforeEach(() => {
    mockOrdersDB.getOrder.mockClear()
    mockOrdersDB.updateOrder.mockClear()
    mockStripe.webhooks.constructEventAsync.mockClear()
    mockLogger.info.mockClear()
    mockLogger.warn.mockClear()
    mockLogger.error.mockClear()
    mockExtractPaymentIntentFields.mockClear()
    mockSendEmail.mockClear()
    mockExtractPaymentIntentFields.mockReturnValue({})
  })

  it('ignores older webhook events by event.created', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_new',
      }),
    )

    const result = await updateOrderFromWebhook(
      'pi_test_123',
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_old',
        eventCreated: 199,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.justPaid).toBe(false)
  })

  it('ignores duplicate webhook events in the same second', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_same',
      }),
    )

    const result = await updateOrderFromWebhook(
      'pi_test_123',
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_same',
        eventCreated: 200,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.justPaid).toBe(false)
  })

  it('ignores same-second regressive status transitions', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
        lastStripeEventCreated: 200,
        lastStripeEventId: 'evt_newer',
      }),
    )

    const result = await updateOrderFromWebhook(
      'pi_test_123',
      { paymentStatus: 'requires_action' },
      {
        eventType: 'payment_intent.requires_action',
        eventId: 'evt_older_state',
        eventCreated: 200,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.justPaid).toBe(false)
  })

  it('accepts same-second non-regressive status transitions', async () => {
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

    const result = await updateOrderFromWebhook(
      'pi_test_123',
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

    const result = await updateOrderFromWebhook(
      'pi_test_123',
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
    expect(result?.justPaid).toBe(true)
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

    const result = await updateOrderFromWebhook(
      'pi_test_123',
      { paymentStatus: 'processing' },
      {
        eventType: 'payment_intent.processing',
        eventId: 'evt_late',
        eventCreated: 201,
      },
    )

    expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    expect(result).not.toBeNull()
    expect(result?.justPaid).toBe(false)
  })

  it('throws 500 and alerts admin when webhook order update persistence throws', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(
      createOrder({
        paymentStatus: 'processing',
      }),
    )
    mockOrdersDB.updateOrder.mockRejectedValueOnce(
      new Error('webhook update failed'),
    )
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'buyer@example.com',
    })
    mockStripe.webhooks.constructEventAsync.mockResolvedValueOnce(
      createPaymentIntentEvent({
        eventId: 'evt_persist_failed',
        eventCreated: 401,
        type: 'payment_intent.succeeded',
        status: 'succeeded',
      }),
    )

    const event = createPaymentIntentEvent({
      eventId: 'evt_persist_failed',
      eventCreated: 401,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = await createSignedWebhookRequest(event)

    let resultError: unknown = null

    try {
      await processStripeWebhook(payload, signature)
    } catch (error) {
      resultError = error
    }

    expect(resultError).toBeInstanceOf(Internal)
    expect((resultError as Internal).status).toBe(500)
    expect(mockSendEmail).toHaveBeenCalledTimes(1)
    expect(mockSendEmail).toHaveBeenCalledWith(
      'adminPaymentNotification',
      expect.objectContaining({
        notificationType: 'error',
        order: expect.objectContaining({
          paymentId: 'pi_test_123',
          paymentStatus: 'succeeded',
        }) as Order,
      }),
    )
    expect(mockLogger.error).toHaveBeenCalledWith(
      '[CRITICAL] Webhook order update persistence failed',
      expect.objectContaining({
        issueCode: IssueCode.WEBHOOK_ORDER_PERSIST_FAILED,
        persistFailureReason: 'threw',
        entity: 'order',
        operation: 'update',
        paymentId: 'pi_test_123',
        stripeStatus: 'succeeded',
        eventType: 'payment_intent.succeeded',
        eventId: 'evt_persist_failed',
        eventCreated: 401,
      }),
    )
  })

  it('sends confirmed notifications when webhook marks order as just paid', async () => {
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
    mockStripe.webhooks.constructEventAsync.mockResolvedValueOnce(
      createPaymentIntentEvent({
        eventId: 'evt_webhook_paid',
        eventCreated: 402,
        type: 'payment_intent.succeeded',
        status: 'succeeded',
      }),
    )

    const event = createPaymentIntentEvent({
      eventId: 'evt_webhook_paid',
      eventCreated: 402,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = await createSignedWebhookRequest(event)

    const result = await processStripeWebhook(payload, signature)

    expect(result).toEqual({ received: true })
    expect(mockSendEmail).toHaveBeenCalledTimes(2)
    expect(mockSendEmail).toHaveBeenCalledWith('orderConfirmation', {
      order: updatedOrder,
      source: 'webhook',
    })
    expect(mockSendEmail).toHaveBeenCalledWith('adminPaymentNotification', {
      order: updatedOrder,
      notificationType: 'confirmed',
    })
  })

  it('does not send confirmed notifications for succeeded webhook when order is already paid', async () => {
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
    mockStripe.webhooks.constructEventAsync.mockResolvedValueOnce(
      createPaymentIntentEvent({
        eventId: 'evt_repeat_success',
        eventCreated: 403,
        type: 'payment_intent.succeeded',
        status: 'succeeded',
      }),
    )

    const event = createPaymentIntentEvent({
      eventId: 'evt_repeat_success',
      eventCreated: 403,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = await createSignedWebhookRequest(event)

    const result = await processStripeWebhook(payload, signature)

    expect(result).toEqual({ received: true })
    expect(mockSendEmail).not.toHaveBeenCalled()
  })

  it('logs and alerts on missing order for payment_intent.succeeded', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(null)
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'buyer@example.com',
      firstName: 'Buyer',
      lastName: 'Example',
    })
    mockStripe.webhooks.constructEventAsync.mockResolvedValueOnce(
      createPaymentIntentEvent({
        eventId: 'evt_missing_success',
        eventCreated: 301,
        type: 'payment_intent.succeeded',
        status: 'succeeded',
      }),
    )
    const event = createPaymentIntentEvent({
      eventId: 'evt_missing_success',
      eventCreated: 301,
      type: 'payment_intent.succeeded',
      status: 'succeeded',
    })
    const { payload, signature } = await createSignedWebhookRequest(event)

    const result = await processStripeWebhook(payload, signature)

    expect(result).toEqual({ received: true })
    expect(mockSendEmail).toHaveBeenCalledWith(
      'adminPaymentNotification',
      expect.objectContaining({
        notificationType: 'error',
        order: expect.objectContaining({
          paymentId: 'pi_test_123',
          total: 25.99,
          currency: 'USD',
          paymentStatus: 'succeeded',
          email: 'buyer@example.com',
        }) as Order,
      }),
    )

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

  it('logs and alerts on missing order for payment_intent.canceled', async () => {
    mockOrdersDB.getOrder.mockResolvedValueOnce(null)
    mockExtractPaymentIntentFields.mockReturnValue({
      email: 'buyer@example.com',
    })
    mockStripe.webhooks.constructEventAsync.mockResolvedValueOnce(
      createPaymentIntentEvent({
        eventId: 'evt_missing_canceled',
        eventCreated: 302,
        type: 'payment_intent.canceled',
        status: 'canceled',
      }),
    )
    const event = createPaymentIntentEvent({
      eventId: 'evt_missing_canceled',
      eventCreated: 302,
      type: 'payment_intent.canceled',
      status: 'canceled',
    })
    const { payload, signature } = await createSignedWebhookRequest(event)

    const result = await processStripeWebhook(payload, signature)

    expect(result).toEqual({ received: true })
    expect(mockSendEmail).toHaveBeenCalledWith(
      'adminPaymentNotification',
      expect.objectContaining({
        notificationType: 'error',
        order: expect.objectContaining({
          paymentId: 'pi_test_123',
          total: 25.99,
          currency: 'USD',
          paymentStatus: 'canceled',
          email: 'buyer@example.com',
        }) as Order,
      }),
    )

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
