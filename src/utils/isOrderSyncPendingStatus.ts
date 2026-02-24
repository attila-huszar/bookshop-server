import type { PaymentIntentStatus } from '@/types'

export const pendingOrderSyncStatuses: PaymentIntentStatus[] = [
  'processing',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]

export function isOrderSyncPendingStatus(status: PaymentIntentStatus): boolean {
  return pendingOrderSyncStatuses.includes(status)
}
