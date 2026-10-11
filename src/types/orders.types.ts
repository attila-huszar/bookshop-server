import type { z } from 'zod'
import type {
  cmsOrderIdsSchema,
  cmsOrderUpdateSchema,
  orderInsertSchema,
  orderItemSchema,
  orderSelectSchema,
  orderUpdateSchema,
} from '@/validation'

export type Order = z.infer<typeof orderSelectSchema>
export type OrderInsert = z.infer<typeof orderInsertSchema>
export type OrderUpdate = z.infer<typeof orderUpdateSchema>
export type OrderItem = z.infer<typeof orderItemSchema>

export type OrderPaymentSnapshot = Pick<
  Order,
  | 'id'
  | 'paymentStatus'
  | 'lastStripeEventCreated'
  | 'lastStripeEventId'
  | 'lastReconciledAt'
  | 'paidAt'
  | 'updatedAt'
  | 'total'
  | 'currency'
  | 'email'
>

export type OrderReconciliationQuery = {
  staleBefore: Date
  checkedBefore: Date
  failedCheckedBefore: Date
  terminalCheckedBefore: Date
  limit: number
}
export type CmsOrderUpdate = z.infer<typeof cmsOrderUpdateSchema>
export type CmsOrderIds = z.infer<typeof cmsOrderIdsSchema>
