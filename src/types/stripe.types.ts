import type { Stripe } from 'stripe'

// ============================================================================
// Stripe Core Types - Primary Aliases
// ============================================================================

export type StripePaymentIntent = Stripe.PaymentIntent
export type StripeEvent = Stripe.Event

// ============================================================================
// Stripe Nested Types - Commonly Used
// ============================================================================

export type PaymentIntentStatus = Stripe.PaymentIntent.Status
export type PaymentIntentShipping = Stripe.PaymentIntent.Shipping
export type Address = Stripe.Address

// ============================================================================
// Stripe Event Types - Webhook Handlers
// ============================================================================

export type StripePaymentIntentEvent =
  | Stripe.PaymentIntentCreatedEvent
  | Stripe.PaymentIntentSucceededEvent
  | Stripe.PaymentIntentAmountCapturableUpdatedEvent
  | Stripe.PaymentIntentPartiallyFundedEvent
  | Stripe.PaymentIntentPaymentFailedEvent
  | Stripe.PaymentIntentRequiresActionEvent
  | Stripe.PaymentIntentProcessingEvent
  | Stripe.PaymentIntentCanceledEvent

export type PaymentIntentEventMeta = {
  eventType: StripePaymentIntentEvent['type']
  eventId: string
  eventCreated: number
}

// ============================================================================
// Type Guards - Event Narrowing
// ============================================================================

export const isPaymentIntentEvent = (
  event: StripeEvent,
): event is StripePaymentIntentEvent => {
  switch (event.type) {
    case 'payment_intent.created':
    case 'payment_intent.succeeded':
    case 'payment_intent.amount_capturable_updated':
    case 'payment_intent.partially_funded':
    case 'payment_intent.payment_failed':
    case 'payment_intent.requires_action':
    case 'payment_intent.processing':
    case 'payment_intent.canceled':
      return true
    default:
      return false
  }
}
