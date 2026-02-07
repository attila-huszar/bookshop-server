import type { EmailJobType } from '@/types'

export const subjectMap: Record<EmailJobType, string> = {
  verification: 'Bookshop - Verify your email address',
  passwordReset: 'Bookshop - Forgotten Password',
  orderConfirmation: 'Bookshop - Order Confirmation',
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
