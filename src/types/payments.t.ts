import type { z } from 'zod'
import type { paymentIntentRequestSchema } from '@/validation'
import type { PaymentIntentShipping, PaymentIntentStatus } from './stripe.t'

export type PaymentIntentRequest = z.infer<typeof paymentIntentRequestSchema>

export type PaymentSession = {
  paymentId: string
  paymentToken: string
  amount: number
}

export type PaymentOrderSyncStatus = {
  paymentId: string
  paymentStatus: PaymentIntentStatus
  amount: number
  currency: string
  receiptEmail: string | null
  shipping: PaymentIntentShipping | null
  finalizedAt: string | null
  webhookUpdatedAt: string | null
}

export const orderSyncPendingCode = 'ORDER_SYNC_PENDING' as const
export type OrderSyncPendingCode = typeof orderSyncPendingCode

export type PaymentOrderSyncPendingStatus = PaymentOrderSyncStatus & {
  code: OrderSyncPendingCode
}

export type PaymentOrderSyncResponse =
  | PaymentOrderSyncStatus
  | PaymentOrderSyncPendingStatus
