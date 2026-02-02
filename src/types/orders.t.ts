import type { Stripe } from 'stripe'
import type { z } from 'zod'
import type {
  cartItemSchema,
  checkoutCartSchema,
  orderInsertSchema,
  orderItemSchema,
  orderSelectSchema,
  orderUpdateSchema,
} from '@/validation'

export type Order = z.infer<typeof orderSelectSchema>
export type OrderInsert = z.infer<typeof orderInsertSchema>
export type OrderUpdate = z.infer<typeof orderUpdateSchema>
export type OrderItem = z.infer<typeof orderItemSchema>
export type CartItem = z.infer<typeof cartItemSchema>
export type CheckoutCart = z.infer<typeof checkoutCartSchema>

export type PaymentIntentStatus = Stripe.PaymentIntent.Status
export type PaymentIntentShipping = Stripe.PaymentIntent.Shipping
export type ChargeStatus = Stripe.Charge.Status
export type ChargeShipping = Stripe.Charge.Shipping
export type Address = Stripe.Address
