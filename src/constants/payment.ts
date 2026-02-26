import type { PaymentIntentStatus } from '@/types/stripe.types'

export const retryableStatuses: PaymentIntentStatus[] = [
  'processing',
  'requires_payment_method',
  'requires_confirmation',
  'requires_action',
]
