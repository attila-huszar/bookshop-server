import type {
  emailDeliveryStatuses,
  emailOutboxStatuses,
} from '@/constants/email'
import type { EmailType, SendEmailProps } from './worker.types'

export type EmailDeliveryStatus = (typeof emailDeliveryStatuses)[number]
export type EmailOutboxStatus = (typeof emailOutboxStatuses)[number]

export type EmailDeliveryUpdate = {
  status: EmailDeliveryStatus
  attempts: number
  nextAttemptAt: Date | null
  error: string | null
}

export type EmailOutboxQuery = {
  page: number
  limit: number
  paymentId?: string
  type?: EmailType
  status?: EmailOutboxStatus
  search?: string
}

export type EmailOutboxDraft = {
  id: string
  payload: SendEmailProps
  availableAt: Date
}

export type EmailOutboxEntry = EmailOutboxDraft & {
  attempts: number
  leaseToken: string | null
  lockedUntil: Date | null
  processedAt: Date | null
  lastError: string | null
  deliveryStatus: EmailDeliveryStatus | null
  deliveryAttempts: number
  deliveryUpdatedAt: Date | null
  deliveryNextAttemptAt: Date | null
  deliveryError: string | null
  createdAt: Date
}
