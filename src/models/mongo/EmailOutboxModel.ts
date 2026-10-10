import mongoose from 'mongoose'
import { emailDeliveryStatuses } from '@/constants/email'
import type { EmailOutboxEntry } from '@/types/outbox.types'

const schema = new mongoose.Schema<EmailOutboxEntry>({
  id: { type: String, required: true, unique: true },
  payload: { type: mongoose.Schema.Types.Mixed, required: true },
  availableAt: { type: Date, required: true },
  attempts: { type: Number, required: true, default: 0 },
  leaseToken: { type: String, default: null },
  lockedUntil: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  lastError: { type: String, default: null },
  deliveryStatus: { type: String, enum: emailDeliveryStatuses, default: null },
  deliveryAttempts: { type: Number, required: true, default: 0 },
  deliveryUpdatedAt: { type: Date, default: null },
  deliveryNextAttemptAt: { type: Date, default: null },
  deliveryError: { type: String, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
})

schema.index({ processedAt: 1, availableAt: 1 })
export const EmailOutboxModel = mongoose.model<EmailOutboxEntry>(
  'EmailOutbox',
  schema,
)
