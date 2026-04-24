import type { QUEUE } from '@/constants'
import type { AdminNotification } from './enums'
import type { Order } from './orders.types'

export type QueueName = typeof QUEUE.EMAIL.NAME

export type EmailJobType =
  (typeof QUEUE.EMAIL.JOB)[keyof typeof QUEUE.EMAIL.JOB]

export type VerificationEmailProps = {
  type: 'verification'
  toAddress: string
  toName: string
  tokenLink: string
}

export type PasswordResetEmailProps = {
  type: 'passwordReset'
  toAddress: string
  toName: string
  tokenLink: string
}

export type OrderConfirmationEmailProps = {
  type: 'orderConfirmation'
  toAddress: string
  toName: string
  order: Order
}

export type AdminPaymentNotificationEmailItem = Pick<
  Order['items'][number],
  'title' | 'quantity' | 'price' | 'discount'
>

export type AdminPaymentNotificationEmailProps = {
  type: 'adminPaymentNotification'
  notificationType: AdminNotification
  toAddress: string
  emailTitle: string
  customerName: string
  customerEmail: string
  items: AdminPaymentNotificationEmailItem[]
  shippingAddress: string
} & Pick<Order, 'paymentId' | 'total' | 'currency' | 'paymentStatus'>

export type SendEmailProps =
  | VerificationEmailProps
  | PasswordResetEmailProps
  | OrderConfirmationEmailProps
  | AdminPaymentNotificationEmailProps

export type AdminPaymentNotificationOrder = Pick<
  Order,
  'paymentId' | 'items' | 'total' | 'currency' | 'paymentStatus'
> &
  Partial<Pick<Order, 'firstName' | 'lastName' | 'email' | 'shipping'>>

export type SendEmailInputMap = {
  [QUEUE.EMAIL.JOB.VERIFICATION]: {
    toAddress: string
    toName: string
    tokenLink: string
  }
  [QUEUE.EMAIL.JOB.PASSWORD_RESET]: {
    toAddress: string
    toName: string
    tokenLink: string
  }
  [QUEUE.EMAIL.JOB.ORDER_CONFIRMATION]: {
    order: Order
  }
  [QUEUE.EMAIL.JOB.ADMIN_PAYMENT_NOTIFICATION]: {
    order: AdminPaymentNotificationOrder
    notificationType: AdminNotification
  }
}
