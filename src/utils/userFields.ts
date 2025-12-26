import type Stripe from 'stripe'
import type { Order } from '@/types'

export function splitFullName(fullName: string): {
  firstName: string | null
  lastName: string | null
} {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)

  if (parts.length === 0) {
    return { firstName: null, lastName: null }
  }

  const firstName = parts[0] ?? null
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null

  return {
    firstName: firstName && firstName.length >= 2 ? firstName : null,
    lastName: lastName && lastName.length >= 2 ? lastName : null,
  }
}

export function extractCustomerFields(
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

  const phone = shipping?.phone?.trim()
  if (phone) fields.phone = phone
  if (shipping?.address) fields.address = shipping.address

  return fields
}
