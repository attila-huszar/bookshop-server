import type { Order } from './orders.t'
import type { QUEUE } from '../constants'

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

export type SendEmailProps =
  | VerificationEmailProps
  | PasswordResetEmailProps
  | OrderConfirmationEmailProps
