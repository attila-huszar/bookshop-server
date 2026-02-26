import { getOrderRef } from '@/utils'
import {
  AdminNotification,
  type EmailJobType,
  type SendEmailProps,
} from '@/types'

type StaticSubjectType = Exclude<EmailJobType, 'adminPaymentNotification'>

export const staticSubjectMap: Record<StaticSubjectType, string> = {
  verification: 'Bookshop - Verify your email address',
  passwordReset: 'Bookshop - Forgotten Password',
  orderConfirmation: 'Bookshop - Order Confirmation',
}

const adminPhaseLabelMap: Record<AdminNotification, string> = {
  [AdminNotification.Created]: 'CREATED',
  [AdminNotification.Confirmed]: 'CONFIRMED',
  [AdminNotification.Error]: 'ERROR',
}

export const getEmailSubject = (props: SendEmailProps): string => {
  switch (props.type) {
    case 'adminPaymentNotification':
      return `Bookshop | Order #${getOrderRef(props.paymentId)} | ${adminPhaseLabelMap[props.notificationType]}`
    case 'verification':
    case 'passwordReset':
    case 'orderConfirmation':
      return staticSubjectMap[props.type]
  }
}

export const cid = 'bookshop-logo-cid'

export const attachments = [
  {
    filename: 'bookshop-logo.png',
    path: process.cwd() + '/src/resources/images/bookshop-logo.png',
    contentType: 'image/png',
    cid,
  },
]
