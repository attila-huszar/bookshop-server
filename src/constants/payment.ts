import type { PaymentIntentStatus } from '@/types/stripe.types'

export const terminalStatuses: PaymentIntentStatus[] = ['succeeded', 'canceled']
