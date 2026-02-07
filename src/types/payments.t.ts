import type { z } from 'zod'
import type { paymentIntentRequestSchema } from '@/validation'

export type PaymentIntentRequest = z.infer<typeof paymentIntentRequestSchema>

export type PaymentSession = {
  session: string
  amount: number
}
