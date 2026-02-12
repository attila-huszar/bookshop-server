import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { ordersTable } from '@/models/sqlite'
import { maxItemQuantity } from '@/constants'
import type { PaymentIntentStatus } from '@/types'

export const orderSelectSchema = createSelectSchema(ordersTable, {
  paymentStatus: () => z.custom<PaymentIntentStatus>(),
})

export const orderInsertSchema = createInsertSchema(ordersTable, {
  paymentStatus: () => z.custom<PaymentIntentStatus>(),
})

export const orderUpdateSchema = createUpdateSchema(ordersTable, {
  paymentStatus: () => z.custom<PaymentIntentStatus>().optional(),
})

export const orderItemSchema = z.object({
  id: z.int().positive(),
  title: z.string().trim().min(1),
  author: z.string().nullable(),
  price: z.number().positive(),
  discount: z.number().min(0).max(100),
  quantity: z.int().min(1).max(maxItemQuantity),
})
