import { createHash } from 'node:crypto'
import type {
  Order,
  PaymentIntentRequest,
  PublicUser,
  StripeCharge,
  StripeDispute,
  StripePaymentIntent,
  StripeRefund,
} from '@/types'
import { splitFullName } from './string.utils'

type PaymentIntentRef = Pick<
  StripeCharge | StripeRefund | StripeDispute,
  'payment_intent'
>

export const getPaymentIntentId = <T extends PaymentIntentRef>(source: T) =>
  typeof source.payment_intent === 'string'
    ? source.payment_intent
    : source.payment_intent?.id

export function extractPaymentIntentFields(
  paymentIntent: StripePaymentIntent,
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

/**
 * Stripe idempotency is account-wide. Bind the key to the checkout principal
 * and request contents so a reused client key cannot replay another cart.
 */
export function getPaymentIdempotencyKey(
  clientRequestId: string,
  request: PaymentIntentRequest,
  user: PublicUser | null,
): string {
  const scope = user?.uuid ?? 'guest'
  const fingerprint = JSON.stringify({
    clientRequestId,
    request,
    scope,
  })

  return `bookshop:${createHash('sha256').update(fingerprint).digest('hex')}`
}
