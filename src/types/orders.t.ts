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

export type OrderRequest = {
  paymentId: string
  status: 'pending' | 'paid' | 'cancelled'
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
