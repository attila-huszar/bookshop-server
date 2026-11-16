import { env } from '@/config'
import { extractPaymentIntentFields } from '@/utils/stripe.utils'
import { log } from '@/libs/logger'
import { getStripe } from '@/libs/stripe'
import { BadRequest } from '@/errors/BadRequest'
import { Internal } from '@/errors/Internal'
import {
  isPaymentIntentEvent,
  IssueCode,
  type OrderUpdate,
  type PaymentIntentEventMeta,
  type StripeEvent,
  type StripePaymentIntent,
} from '@/types'
import { applyPaymentIntentWebhookToOrder } from './orders.service'

function reportMissingWebhookOrder(
  paymentIntent: StripePaymentIntent,
  eventMeta: PaymentIntentEventMeta,
): void {
  log.error('❌ [STRIPE] Missing order for payment_intent webhook', {
    issueCode: IssueCode.WEBHOOK_MISSING_ORDER,
    paymentId: paymentIntent.id,
    ...eventMeta,
    stripeStatus: paymentIntent.status,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    receiptEmail: paymentIntent.receipt_email ?? null,
  })
}

async function handlePaymentIntentWebhook(
  paymentIntent: StripePaymentIntent,
  eventMeta: PaymentIntentEventMeta,
): Promise<void> {
  // A Stripe account can send PaymentIntents created outside this demo.
  if (
    !paymentIntent.metadata?.orderId ||
    !paymentIntent.metadata.checkoutRequestId
  ) {
    log.debug(
      '[STRIPE] Ignoring PaymentIntent outside the bookshop checkout flow',
      { paymentId: paymentIntent.id },
    )

    return
  }

  const { eventType, eventId } = eventMeta
  const isTerminalEvent =
    eventType === 'payment_intent.succeeded' ||
    eventType === 'payment_intent.canceled'
  const includeCustomerDetails =
    isTerminalEvent || eventType === 'payment_intent.amount_capturable_updated'
  const updates: OrderUpdate = {
    ...(includeCustomerDetails && extractPaymentIntentFields(paymentIntent)),
    paymentStatus: paymentIntent.status,
  }
  const order = await applyPaymentIntentWebhookToOrder(
    paymentIntent,
    updates,
    eventMeta,
  )

  if (!order) {
    if (isTerminalEvent) {
      reportMissingWebhookOrder(paymentIntent, eventMeta)

      throw new Internal(
        `Missing order for Stripe payment intent: ${paymentIntent.id}`,
      )
    }

    log.warn('Failed to find order for payment intent', {
      paymentId: paymentIntent.id,
      ...eventMeta,
    })

    return
  }

  if (order.paymentStatus !== paymentIntent.status) {
    return
  }

  const context = { orderId: order.id, paymentId: paymentIntent.id, eventId }

  switch (eventType) {
    case 'payment_intent.succeeded':
      log.info('[STRIPE] Payment succeeded via webhook', context)
      break
    case 'payment_intent.amount_capturable_updated':
      log.info('[STRIPE] Payment capturable via webhook', context)
      break
    case 'payment_intent.payment_failed':
      log.info('[STRIPE] Payment failed via webhook', {
        ...context,
        code: paymentIntent.last_payment_error?.code,
        declineCode: paymentIntent.last_payment_error?.decline_code,
        error: paymentIntent.last_payment_error?.message,
      })
      break
    case 'payment_intent.canceled':
      log.info('[STRIPE] Payment canceled via webhook', context)
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
    event = await getStripe().webhooks.constructEventAsync(
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
  } else if (event.type.startsWith('payment_intent.')) {
    log.debug('[STRIPE] Ignoring unsupported webhook event', {
      eventType: event.type,
      eventId: event.id,
    })
  }

  return { received: true }
}
