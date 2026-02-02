import type { Stripe } from 'stripe'
import type { Order } from '@/types'
import { splitFullName } from './textTransforms'

export const getPaymentIntentIdFromCharge = (charge: Stripe.Charge) =>
  typeof charge.payment_intent === 'string'
    ? charge.payment_intent
    : charge.payment_intent?.id

export const getPaymentIntentIdFromRefund = (refund: Stripe.Refund) =>
  typeof refund.payment_intent === 'string'
    ? refund.payment_intent
    : refund.payment_intent?.id

export function extractPaymentIntentFields(
  paymentIntent: Stripe.PaymentIntent,
): Partial<Order> {
  const fields: Partial<Order> = {}

  const email = paymentIntent.receipt_email?.trim()
  if (email) fields.email = email

  const shipping = paymentIntent.shipping
  const shippingName = shipping?.name?.trim()

  if (shippingName) {
    const { firstName, lastName } = splitFullName(shippingName)
    if (firstName) fields.firstName = firstName
    if (lastName) fields.lastName = lastName
  }

  if (shipping) fields.shipping = shipping

  return fields
}

export function extractChargeFields(charge: Stripe.Charge): Partial<Order> {
  const fields: Partial<Order> = {}
  const billingDetails = charge.billing_details

  const billingEmail = billingDetails?.email?.trim()
  if (billingEmail) fields.email = billingEmail

  const billingName = billingDetails?.name?.trim()
  if (billingName) {
    const { firstName, lastName } = splitFullName(billingName)
    if (firstName) fields.firstName = firstName
    if (lastName) fields.lastName = lastName
  }

  return fields
}
