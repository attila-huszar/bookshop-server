import type { EmailOutboxEntry, EmailOutboxStatus } from '@/types/outbox.types'

export function emailOutboxStatus(
  entry: EmailOutboxEntry,
  now: Date,
): EmailOutboxStatus {
  if (entry.deliveryStatus) {
    return entry.deliveryStatus
  }
  if (entry.processedAt) {
    return 'processed'
  }
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return 'publishing'
  }
  if (entry.lastError) {
    return 'retrying'
  }

  return entry.availableAt > now ? 'scheduled' : 'pending'
}

/** Fixed CMS allowlist: payloads, account links, and lease tokens stay private. */
export function emailOutboxResponse(entry: EmailOutboxEntry, now: Date) {
  const payload = entry.payload
  const status = emailOutboxStatus(entry, now)
  const paymentId =
    payload.type === 'orderConfirmation'
      ? payload.order.paymentId
      : payload.type === 'adminPaymentNotification'
        ? payload.paymentId
        : null
  const nextAttemptAt = entry.deliveryStatus
    ? entry.deliveryNextAttemptAt
    : entry.processedAt || (entry.lockedUntil && entry.lockedUntil > now)
      ? null
      : entry.availableAt

  return {
    id: entry.id,
    type: payload.type,
    recipient: payload.toAddress,
    notificationType:
      payload.type === 'adminPaymentNotification'
        ? payload.notificationType
        : null,
    paymentId,
    failureReason:
      payload.type === 'adminPaymentNotification'
        ? (payload.reconciliation?.reason ?? null)
        : null,
    status,
    queueAttempts: entry.attempts,
    deliveryAttempts: entry.deliveryAttempts ?? 0,
    createdAt: entry.createdAt.toISOString(),
    processedAt: entry.processedAt?.toISOString() ?? null,
    deliveryUpdatedAt: entry.deliveryUpdatedAt?.toISOString() ?? null,
    nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
    lastError: entry.deliveryError
      ? 'Email delivery failed'
      : entry.lastError
        ? 'Email publication failed'
        : null,
  }
}
