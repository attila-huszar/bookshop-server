import { z } from 'zod'
import { Stripe } from 'stripe'
import type {
  orderSelectSchema,
  orderInsertSchema,
  orderItemSchema,
  cartItemSchema,
  checkoutCartSchema,
  orderUpdateSchema,
} from '@/validation'

export type Order = z.infer<typeof orderSelectSchema>
export type OrderInsert = z.infer<typeof orderInsertSchema>
export type OrderUpdate = z.infer<typeof orderUpdateSchema>
export type OrderItem = z.infer<typeof orderItemSchema>
export type CartItem = z.infer<typeof cartItemSchema>
export type CheckoutCart = z.infer<typeof checkoutCartSchema>

export enum OrderStatus {
  Pending = 'PENDING',
  Paid = 'PAID',
  Captured = 'CAPTURED',
  Canceled = 'CANCELED',
}

export type PaymentIntentCreate = Pick<
  Stripe.PaymentIntentCreateParams,
  'amount' | 'currency' | 'description'
>
export type StripeStatus = Stripe.PaymentIntent.Status
export type StripeShipping = Stripe.PaymentIntent.Shipping
export type StripeAddress = Stripe.Address
