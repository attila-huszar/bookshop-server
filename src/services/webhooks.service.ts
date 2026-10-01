import { env } from '@/config'
import { extractPaymentIntentFields } from '@/utils'
import { log, stripe } from '@/libs'
import { cancelAdminPaymentErrorAlert, enqueueEmail } from '@/queues'
import { BadRequest } from '@/errors/BadRequest'
import { Internal } from '@/errors/Internal'
import {
  AdminNotification,
  isPaymentIntentEvent,
  IssueCode,
  type Order,
  type OrderUpdate,
  type PaymentIntentEventMeta,
  type StripeEvent,
  type StripePaymentIntent,
} from '@/types'
import { applyPaymentIntentWebhookToOrder } from './orders.service'

function notifyOrderConfirmed(order: Order): void {
  enqueueEmail('orderConfirmation', { order })
  enqueueEmail('adminPaymentNotification', {
    order,
    notificationType: AdminNotification.Confirmed,
  })
}

function reportMissingWebhookOrder(
  paymentIntent: StripePaymentIntent,
  eventMeta: PaymentIntentEventMeta,
): void {
  const extractedFields = extractPaymentIntentFields(paymentIntent)

  void log.error('[CRITICAL] Missing order for Stripe payment_intent webhook', {
    issueCode: IssueCode.WEBHOOK_MISSING_ORDER,
    paymentId: paymentIntent.id,
    ...eventMeta,
    stripeStatus: paymentIntent.status,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    receiptEmail: paymentIntent.receipt_email ?? null,
  })

  enqueueEmail('adminPaymentNotification', {
    notificationType: AdminNotification.Error,
    source: IssueCode.WEBHOOK_MISSING_ORDER,
    order: {
      paymentId: paymentIntent.id,
      items: [],
      total: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      paymentStatus: paymentIntent.status,
      ...extractedFields,
    },
  })
}

async function handlePaymentIntentWebhook(
  paymentIntent: StripePaymentIntent,
  eventMeta: PaymentIntentEventMeta,
): Promise<void> {
  const { eventType } = eventMeta
  const isTerminalEvent =
    eventType === 'payment_intent.succeeded' ||
    eventType === 'payment_intent.canceled'
  const includeCustomerDetails =
    isTerminalEvent || eventType === 'payment_intent.amount_capturable_updated'
  const updates: OrderUpdate = {
    ...(includeCustomerDetails && extractPaymentIntentFields(paymentIntent)),
    paymentStatus: paymentIntent.status,
  }
  const result = await applyPaymentIntentWebhookToOrder(
    paymentIntent,
    updates,
    eventMeta,
  )

  if (!result) {
    if (isTerminalEvent) {
      reportMissingWebhookOrder(paymentIntent, eventMeta)
      throw new Internal(
        `Missing order for Stripe payment intent: ${paymentIntent.id}`,
      )
    }
    void log.warn('Failed to find order for payment intent', {
      paymentId: paymentIntent.id,
      ...eventMeta,
    })
    return
  }

  const { order, becamePaid } = result
  if (order.paymentStatus !== paymentIntent.status) return

  switch (eventType) {
    case 'payment_intent.succeeded':
      void cancelAdminPaymentErrorAlert(paymentIntent.id).catch(
        (error: unknown) => {
          void log.warn('[QUEUE] Failed to cancel pending admin error alert', {
            error,
            paymentId: paymentIntent.id,
          })
        },
      )
      if (becamePaid) notifyOrderConfirmed(order)
      void log.info('[STRIPE] Payment succeeded via webhook', {
        paymentId: paymentIntent.id,
      })
      break
    case 'payment_intent.amount_capturable_updated':
      void log.info('[STRIPE] Payment capturable via webhook', {
        paymentId: paymentIntent.id,
      })
      break
    case 'payment_intent.payment_failed':
      void log.warn('[STRIPE] Payment failed via webhook', {
        paymentId: paymentIntent.id,
        error: paymentIntent.last_payment_error?.message,
      })
      break
    case 'payment_intent.canceled':
      void log.info('[STRIPE] Payment canceled via webhook', {
        paymentId: paymentIntent.id,
      })
      break
    case 'payment_intent.created':
    case 'payment_intent.partially_funded':
    case 'payment_intent.requires_action':
    case 'payment_intent.processing':
      break
    default: {
      const exhaustiveCheck: never = eventType
      return exhaustiveCheck
    }
  }
}

export async function verifyAndHandleStripeWebhook(
  payload: string,
  signature: string,
): Promise<{ received: boolean }> {
  if (!env.stripeWebhookSecret) {
    throw new Internal('Stripe webhook secret not configured')
  }

  let event: StripeEvent

  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.stripeWebhookSecret,
    )
  } catch (err) {
    throw new BadRequest(
      `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }

  if (isPaymentIntentEvent(event)) {
    await handlePaymentIntentWebhook(event.data.object, {
      eventType: event.type,
      eventId: event.id,
      eventCreated: event.created,
    })
  } else {
    void log.info(`[STRIPE] Unhandled webhook event type: ${event.type}`)
  }

  return { received: true }
}
