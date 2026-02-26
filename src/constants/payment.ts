import type { PaymentIntentStatus } from '@/types/stripe.types'

export const retryableStatuses: PaymentIntentStatus[] = [
  'processing',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]

export const terminalStatuses: PaymentIntentStatus[] = ['succeeded', 'canceled']

export const orderSyncStripeFallbackThresholdMs = 30_000
