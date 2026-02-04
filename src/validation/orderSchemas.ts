import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { ordersTable } from '@/models/sqlite'
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
  title: z.string().trim().nonempty(),
  price: z.number().positive(),
  discount: z.number().min(0).max(100),
  quantity: z.int().positive(),
})

export const paymentIntentRequestSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.int().positive(),
        quantity: z.int().positive(),
      }),
    )
    .min(1),
})
