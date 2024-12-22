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
  Cancelled = 'CANCELLED',
}

export type OrderRequest = {
  paymentId: string
  paymentIntentStatus: Stripe.PaymentIntent.Status
  orderStatus: OrderStatus
  total: number
  currency: string
  items: OrderItem[]
  firstName: string
  lastName: string
  email: string
  phone?: string
  address: Stripe.Address
}

export type PaymentIntentCreateRequest = Pick<
  Stripe.PaymentIntentCreateParams,
  'amount' | 'currency' | 'description'
>
