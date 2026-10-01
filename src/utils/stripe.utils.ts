import { createHash } from 'node:crypto'
import type {
  Order,
  PaymentIntentRequest,
  PublicUser,
  StripePaymentIntent,
} from '@/types'
import { splitFullName } from './string.utils'

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
  clientIdempotencyKey: string,
  request: PaymentIntentRequest,
  user: PublicUser | null,
): string {
  const scope = user?.uuid ?? 'guest'
  const fingerprint = JSON.stringify({
    clientIdempotencyKey,
    request,
    scope,
  })

  return `bookshop:${createHash('sha256').update(fingerprint).digest('hex')}`
}
