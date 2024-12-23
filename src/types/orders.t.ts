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
  userFirstName: string
  userLastName: string
  userEmail: string
  userPhone?: string
  userAddress: Stripe.Address
  orderTotal: number
  orderCurrency: string
  orderItems: OrderItem[]
}

export type PaymentIntentCreateRequest = Pick<
  Stripe.PaymentIntentCreateParams,
  'amount' | 'currency' | 'description'
>
