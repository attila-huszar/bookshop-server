import type { Stripe } from 'stripe'

// ============================================================================
// Stripe Core Types - Primary Aliases
// ============================================================================

export type StripePaymentIntent = Stripe.PaymentIntent
export type StripeCharge = Stripe.Charge
export type StripeRefund = Stripe.Refund
export type StripeDispute = Stripe.Dispute
export type StripeEvent = Stripe.Event

// ============================================================================
// Stripe Nested Types - Commonly Used
// ============================================================================

export type PaymentIntentStatus = Stripe.PaymentIntent.Status
export type PaymentIntentShipping = Stripe.PaymentIntent.Shipping
export type ChargeStatus = Stripe.Charge.Status
export type ChargeShipping = Stripe.Charge.Shipping
export type BillingDetails = Stripe.Charge.BillingDetails
export type Address = Stripe.Address

// ============================================================================
// Stripe Event Types - Webhook Handlers
// ============================================================================

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

export type RefundEventType = Stripe.ChargeRefundUpdatedEvent

// ============================================================================
// Type Guards - Event Narrowing
// ============================================================================

export const isPaymentIntentEvent = (
  event: StripeEvent,
): event is PaymentIntentEventType => event.type.startsWith('payment_intent.')

export const isChargeEvent = (event: StripeEvent): event is ChargeEventType =>
  event.type === 'charge.succeeded' ||
  event.type === 'charge.updated' ||
  event.type === 'charge.refunded'

export const isRefundEvent = (event: StripeEvent): event is RefundEventType =>
  event.type === 'charge.refund.updated'

export const isDisputeEvent = (event: StripeEvent): event is DisputeEventType =>
  event.type === 'charge.dispute.created' ||
  event.type === 'charge.dispute.closed'
