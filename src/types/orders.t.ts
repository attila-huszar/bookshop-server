import { Stripe } from 'stripe'

export type OrderItem = {
  id: number
  title: string
  price: number
  discount: number
  quantity: number
}

export type OrderCreateRequest = {
  paymentId: string
  orderStatus: 'pending' | 'paid' | 'cancelled'
  orderTotal: number
  orderCurrency: string
  orderItems: OrderItem[]
  userName: string | null
  userEmail: string | null
  userPhone: string | null
  userAddress: Stripe.Address
  orderCreatedAt: string
  orderUpdatedAt: string
}

export type PaymentIntentCreateRequest = Pick<
  Stripe.PaymentIntentCreateParams,
  'amount' | 'currency' | 'description'
>
