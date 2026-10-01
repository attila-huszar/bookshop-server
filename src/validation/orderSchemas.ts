import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { z } from 'zod'
import { ordersTable } from '@/models/sqlite'
import { maxItemQuantity } from '@/constants'
import type { PaymentIntentStatus, SchemaRefinements } from '@/types'
import { emailSchema } from './authSchemas'
import { addressSchema, nameSchema, phoneSchema } from './commonSchemas'

export const paymentIntentStatusSchema = z
  .enum([
    'requires_payment_method',
    'requires_confirmation',
    'requires_action',
    'processing',
    'requires_capture',
    'canceled',
    'succeeded',
  ] as const satisfies readonly PaymentIntentStatus[])
  .transform((status): PaymentIntentStatus => status)

export const orderItemSchema = z.object({
  id: z.int().positive(),
  title: z.string().trim().min(1),
  author: z.string().nullable(),
  imgUrl: z.string().nullable(),
  price: z.number().positive(),
  discount: z.number().min(0).max(100),
  quantity: z.int().min(1).max(maxItemQuantity),
})

const orderFields = {
  paymentStatus: paymentIntentStatusSchema,
  items: z.array(orderItemSchema).min(1),
  total: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  firstName: nameSchema.nullable(),
  lastName: nameSchema.nullable(),
  email: emailSchema.shape.email.nullable(),
  shipping: z
    .object({
      name: z.string().trim().min(1).max(200).optional(),
      address: addressSchema.optional(),
      phone: phoneSchema.nullable().optional(),
      carrier: z.string().nullable().optional(),
      tracking_number: z.string().nullable().optional(),
    })
    .nullable(),
} satisfies SchemaRefinements<typeof ordersTable.$inferInsert>

export const orderSelectSchema = createSelectSchema(ordersTable, {
  paymentStatus: paymentIntentStatusSchema,
})

export const orderInsertSchema = createInsertSchema(ordersTable, {
  ...orderFields,
  firstName: orderFields.firstName.optional(),
  lastName: orderFields.lastName.optional(),
  email: orderFields.email.optional(),
  shipping: orderFields.shipping.optional(),
  checkoutRequestId: z.string().min(1),
} satisfies SchemaRefinements<typeof ordersTable.$inferInsert>)

export const orderUpdateSchema = createUpdateSchema(ordersTable, {
  paymentStatus: orderFields.paymentStatus.optional(),
  items: orderFields.items.optional(),
  total: orderFields.total.optional(),
  currency: orderFields.currency.optional(),
  firstName: orderFields.firstName.optional(),
  lastName: orderFields.lastName.optional(),
  email: orderFields.email.optional(),
  shipping: orderFields.shipping.optional(),
} satisfies SchemaRefinements<Partial<typeof ordersTable.$inferInsert>>).omit({
  id: true,
  paymentId: true,
  checkoutRequestId: true,
  createdAt: true,
  updatedAt: true,
})

export const cmsOrderUpdateSchema = orderUpdateSchema
  .omit({ paidAt: true, lastStripeEventCreated: true, lastStripeEventId: true })
  .strict()
