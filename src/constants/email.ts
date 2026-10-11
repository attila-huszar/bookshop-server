import { fileURLToPath } from 'node:url'

export const EMAIL = {
  verification: {
    type: 'verification',
    subject: 'Bookshop - Verify your email address',
    path: 'verification',
    tokenField: 'verificationToken',
    expiresField: 'verificationExpires',
    skipIfVerified: true,
  },
  passwordReset: {
    type: 'passwordReset',
    subject: 'Bookshop - Forgotten Password',
    path: 'password-reset',
    tokenField: 'passwordResetToken',
    expiresField: 'passwordResetExpires',
    skipIfVerified: false,
  },
  orderConfirmation: {
    type: 'orderConfirmation',
    subject: 'Bookshop - Order Confirmation',
  },
  adminPaymentNotification: {
    type: 'adminPaymentNotification',
  },
} as const

export const emailQueueName = 'email'

export const emailJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000,
  },
}

export const emailWorkerConcurrency = 1

export const emailDeliveryStatuses = [
  'queued',
  'sending',
  'retrying',
  'sent',
  'skipped',
  'failed',
] as const

export const emailOutboxStatuses = [
  'pending',
  'scheduled',
  'publishing',
  'processed',
  ...emailDeliveryStatuses,
] as const

export const emailLogoFilename = 'bookshop-logo.png'
export const emailLogoFilePath = fileURLToPath(
  new URL(`../resources/images/${emailLogoFilename}`, import.meta.url),
)
export const emailLogoMimeType = 'image/png'
export const emailLogoContentId = 'bookshop-logo-cid'
