import { Stripe } from 'stripe'
import { orders } from '../repository'

export type Order = typeof orders.$inferSelect

export type OrderItem = {
  id: number
  title: string
  price: number
  discount: number
  quantity: number
}

export enum OrderStatus {
  Pending = 'PENDING',
  Paid = 'PAID',
  Canceled = 'CANCELED',
}

export type OrderUpdate = {
  paymentId: string
  fields: Partial<Order>
}

export type PaymentIntentCreate = Pick<
  Stripe.PaymentIntentCreateParams,
  'amount' | 'currency' | 'description'
>
