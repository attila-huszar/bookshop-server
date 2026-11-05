import { TimeMs } from '@/constants/time'

export const EMAIL = {
  verification: {
    type: 'verification',
    subject: 'Bookshop - Verify your email address',
    path: 'verification',
    tokenField: 'verificationToken',
    expiresField: 'verificationExpires',
  },
  passwordReset: {
    type: 'passwordReset',
    subject: 'Bookshop - Forgotten Password',
    path: 'password-reset',
    tokenField: 'passwordResetToken',
    expiresField: 'passwordResetExpires',
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
    delay: TimeMs.FiveSeconds,
  },
} as const

export const emailWorkerConcurrency = 1

export const outboxPolicy = {
  leaseMs: TimeMs.OneMinute,
  batchSize: 50,
  pollMs: TimeMs.TwoSeconds,
  initialRetryMs: TimeMs.FiveSeconds,
  maxRetryMs: TimeMs.OneHour,
  maxRetryExponent: 10,
  retryMultiplier: 2,
  failureLogMs: TimeMs.OneMinute,
} as const

export const smtpPolicy = {
  maxConnections: 5,
  maxMessages: 100,
  connectionTimeoutMs: TimeMs.TenSeconds,
  greetingTimeoutMs: TimeMs.TenSeconds,
  socketTimeoutMs: TimeMs.ThirtySeconds,
} as const

export const emailQueuePolicy = {
  commandTimeoutMs: TimeMs.TenSeconds,
  maxRetriesPerRequest: 1,
} as const

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
export const emailLogoFilePath = Bun.fileURLToPath(
  new URL(`../resources/images/${emailLogoFilename}`, import.meta.url),
)
export const emailLogoMimeType = 'image/png'
export const emailLogoContentId = 'bookshop-logo-cid'
