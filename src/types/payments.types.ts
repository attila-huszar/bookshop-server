import type { z } from 'zod'
import type { paymentIntentRequestSchema } from '@/validation'
import type { AuthVariables } from './users.types'

export type PaymentIntentRequest = z.infer<typeof paymentIntentRequestSchema>

export type PaymentSession = {
  paymentId: string
  paymentToken: string
  amount: number
}

export type PaymentAccess = {
  cookiePaymentId?: string
  userEmail?: string
}

/** Checkout supports authenticated accounts and guests with a payment cookie. */
export type PaymentVariables = Partial<AuthVariables> & {
  paymentAccess?: PaymentAccess
}
