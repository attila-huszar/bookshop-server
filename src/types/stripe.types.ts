import type { Stripe } from 'stripe'

export type StripePaymentIntent = Stripe.PaymentIntent
export type StripeEvent = Stripe.Event

export type PaymentIntentStatus = Stripe.PaymentIntent.Status
export type PaymentIntentShipping = Stripe.PaymentIntent.Shipping

export type StripePaymentIntentEvent = Extract<
  StripeEvent,
  { type: `payment_intent.${string}` }
>

export type PaymentIntentEventMeta = {
  eventType: StripePaymentIntentEvent['type']
  eventId: string
  eventCreated: number
}

// SDK additions require an explicit decision here and in the webhook handler.
const paymentIntentEvents = {
  'payment_intent.created': true,
  'payment_intent.succeeded': true,
  'payment_intent.amount_capturable_updated': true,
  'payment_intent.partially_funded': true,
  'payment_intent.payment_failed': true,
  'payment_intent.requires_action': true,
  'payment_intent.processing': true,
  'payment_intent.canceled': true,
} satisfies Record<StripePaymentIntentEvent['type'], true>

export const isPaymentIntentEvent = (
  event: StripeEvent,
): event is StripePaymentIntentEvent =>
  Object.hasOwn(paymentIntentEvents, event.type)
