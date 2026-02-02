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

export const cartItemSchema = z.object({
  id: z.number('Order item ID is required').int().positive(),
  quantity: z
    .number('Quantity is required')
    .int('Quantity must be an integer')
    .positive('Quantity must be positive')
    .max(50, 'Quantity cannot exceed 50'),
})

export const checkoutCartSchema = z.object({
  items: z
    .array(cartItemSchema, 'Order items are required')
    .min(1, 'Order must contain at least one item'),
})

export const orderItemSchema = z.object({
  id: z.number('Order item ID is required'),
  title: z.string('Title is required'),
  price: z.number('Price is required').positive('Price must be positive'),
  discount: z
    .number()
    .min(0, 'Discount must be at least 0')
    .max(100, 'Discount cannot exceed 100'),
  quantity: z
    .number('Quantity is required')
    .int('Quantity must be an integer')
    .positive('Quantity must be positive'),
})
