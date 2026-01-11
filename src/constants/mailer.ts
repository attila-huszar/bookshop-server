import type { EmailJobType } from '@/types'

export const subjectMap: Record<EmailJobType, string> = {
  verification: 'Book Shop - Verify your email address',
  passwordReset: 'Book Shop - Forgotten Password',
  orderConfirmation: 'Book Shop - Order Confirmation',
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
