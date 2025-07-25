import { z } from 'zod'
import { Stripe } from 'stripe'
import { ordersTable } from '@/models/sqlite'
import type {
  orderItemSchema,
  orderCreateSchema,
  orderUpdateSchema,
} from '@/validation'

export type Order = typeof ordersTable.$inferSelect

export type OrderCreate = z.infer<typeof orderCreateSchema>
export type OrderUpdate = z.infer<typeof orderUpdateSchema>

export type OrderItem = z.infer<typeof orderItemSchema>

export enum OrderStatus {
  Pending = 'PENDING',
  Paid = 'PAID',
  Canceled = 'CANCELED',
}

export type PaymentIntentCreate = Pick<
  Stripe.PaymentIntentCreateParams,
  'amount' | 'currency' | 'description'
>

export type PaymentIntentStatus = Stripe.PaymentIntent.Status

export const paymentIntentStatusValues = [
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
  'processing',
  'succeeded',
  'canceled',
  'requires_capture',
] as const
