import type { Stripe } from 'stripe'

export type PaymentIntentEventType =
  | Stripe.PaymentIntentCreatedEvent
  | Stripe.PaymentIntentSucceededEvent
  | Stripe.PaymentIntentAmountCapturableUpdatedEvent
  | Stripe.PaymentIntentPartiallyFundedEvent
  | Stripe.PaymentIntentPaymentFailedEvent
  | Stripe.PaymentIntentRequiresActionEvent
  | Stripe.PaymentIntentProcessingEvent
  | Stripe.PaymentIntentCanceledEvent

export type ChargeEventType =
  | Stripe.ChargeSucceededEvent
  | Stripe.ChargeUpdatedEvent
  | Stripe.ChargeRefundedEvent

export type DisputeEventType =
  | Stripe.ChargeDisputeCreatedEvent
  | Stripe.ChargeDisputeClosedEvent

export const isPaymentIntentEvent = (
  event: Stripe.Event,
): event is PaymentIntentEventType => event.type.startsWith('payment_intent.')

export const isChargeEvent = (event: Stripe.Event): event is ChargeEventType =>
  event.type === 'charge.succeeded' ||
  event.type === 'charge.updated' ||
  event.type === 'charge.refunded'

export const isRefundEvent = (
  event: Stripe.Event,
): event is Stripe.ChargeRefundUpdatedEvent =>
  event.type === 'charge.refund.updated'

export const isDisputeEvent = (
  event: Stripe.Event,
): event is DisputeEventType =>
  event.type === 'charge.dispute.created' ||
  event.type === 'charge.dispute.closed'
