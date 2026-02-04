import type { z } from 'zod'
import type {
  orderInsertSchema,
  orderItemSchema,
  orderSelectSchema,
  orderUpdateSchema,
  paymentIntentRequestSchema,
} from '@/validation'

export type Order = z.infer<typeof orderSelectSchema>
export type OrderInsert = z.infer<typeof orderInsertSchema>
export type OrderUpdate = z.infer<typeof orderUpdateSchema>
export type OrderItem = z.infer<typeof orderItemSchema>
export type PaymentIntentRequest = z.infer<typeof paymentIntentRequestSchema>
