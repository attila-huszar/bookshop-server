import type { EMAIL } from '@/constants'
import type { AdminNotification } from './enums'
import type { Order } from './orders.types'

export type EmailType = (typeof EMAIL)[keyof typeof EMAIL]['type']
export type AccountEmailType =
  typeof EMAIL.verification.type | typeof EMAIL.passwordReset.type

type AccountEmailFields = {
  toAddress: string
  toName: string
  tokenLink: string
}

export type VerificationEmailProps = AccountEmailFields & {
  type: typeof EMAIL.verification.type
}

export type PasswordResetEmailProps = AccountEmailFields & {
  type: typeof EMAIL.passwordReset.type
}

export type OrderConfirmationEmailProps = {
  type: typeof EMAIL.orderConfirmation.type
  toAddress: string
  toName: string
  order: Pick<Order, 'paymentId' | 'total' | 'currency' | 'shipping'> & {
    items: OrderEmailItem[]
  }
}

export type OrderEmailItem = Pick<
  Order['items'][number],
  'title' | 'quantity' | 'price' | 'discount'
>

export type ReconciliationAlert = {
  alertId: string
  orderId: number
  reason: string
  failures: number
  liveMode: boolean
}

export type AdminPaymentNotificationEmailProps = {
  type: typeof EMAIL.adminPaymentNotification.type
  notificationType: AdminNotification
  reconciliation?: ReconciliationAlert
  toAddress: string
  emailTitle: string
  customerName: string
  customerEmail: string
  items: OrderEmailItem[]
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
  [EMAIL.verification.type]: AccountEmailFields
  [EMAIL.passwordReset.type]: AccountEmailFields
  [EMAIL.orderConfirmation.type]: {
    order: Order
  }
  [EMAIL.adminPaymentNotification.type]: {
    order: AdminPaymentNotificationOrder
    notificationType: AdminNotification
    reconciliation?: ReconciliationAlert
  }
}

export type EmailInput = {
  [Type in keyof SendEmailInputMap]: {
    type: Type
    data: SendEmailInputMap[Type]
  }
}[keyof SendEmailInputMap]
