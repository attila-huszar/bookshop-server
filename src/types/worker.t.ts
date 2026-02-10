import type { QUEUE } from '@/constants'
import type { Order } from './orders.t'

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

export type AdminPaymentNotificationEmailProps = {
  type: 'adminPaymentNotification'
  toAddress: string
  emailTitle: string
  paymentId: string
  customerName: string
  customerEmail: string
  items: {
    title: string
    quantity: number
    price: number
    discount?: number
  }[]
  total: number
  currency: string
  paymentStatus: string
  shippingAddress: string
}

export type SendEmailProps =
  | VerificationEmailProps
  | PasswordResetEmailProps
  | OrderConfirmationEmailProps
  | AdminPaymentNotificationEmailProps
