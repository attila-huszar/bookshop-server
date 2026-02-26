import type {
  BillingDetails,
  Order,
  PublicUser,
  StripeCharge,
  StripeDispute,
  StripePaymentIntent,
  StripeRefund,
  User,
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

export function extractChargeFields(charge: StripeCharge): Partial<Order> {
  const fields: Partial<Order> = {}
  const billingDetails: BillingDetails = charge.billing_details

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

export const stripSensitiveUserFields = (user: User): PublicUser => {
  const {
    id,
    password,
    verified,
    verificationToken,
    verificationExpires,
    passwordResetToken,
    passwordResetExpires,
    createdAt,
    updatedAt,
    ...publicUser
  } = user

  return publicUser
}

export const stripTimestamps = <T extends { createdAt: Date; updatedAt: Date }>(
  entity: T,
): WithoutTS<T> => {
  const { createdAt, updatedAt, ...rest } = entity
  return rest
}
