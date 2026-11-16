import { TimeMs } from '@/constants/time'
import type { PaymentIntentStatus } from '@/types/stripe.types'

export const defaultCurrency = 'USD'

export const terminalStatuses: PaymentIntentStatus[] = ['succeeded', 'canceled']

export const reconciliationRequestPolicy = {
  timeoutMs: TimeMs.TenSeconds,
  maxNetworkRetries: 1,
} as const
