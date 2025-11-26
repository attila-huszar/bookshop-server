import { z } from 'zod'
import { OrderStatus, paymentIntentStatusValues } from '@/types'

export const orderItemRequestSchema = z.object({
  id: z.number('Order item ID is required').int().positive(),
  quantity: z
    .number('Quantity is required')
    .int('Quantity must be an integer')
    .positive('Quantity must be positive')
    .max(50, 'Quantity cannot exceed 50'),
})

export const orderCreateRequestSchema = z.object({
  items: z
    .array(orderItemRequestSchema, 'Order items are required')
    .min(1, 'Order must contain at least one item'),
  firstName: z
    .string('First name is required')
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters')
    .nullable(),
  lastName: z
    .string('Last name is required')
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters')
    .nullable(),
  email: z.email('Invalid email').nullable(),
  phone: z.string().nullable().optional(),
  address: z
    .object({
      line1: z.string(),
      line2: z.string().nullable(),
      city: z.string(),
      state: z.string(),
      postal_code: z.string(),
      country: z.string(),
    })
    .nullable(),
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

export const orderCreateSchema = z.object({
  paymentId: z.string('Payment ID is required'),
  paymentIntentStatus: z.enum(
    paymentIntentStatusValues,
    'Payment intent status is required',
  ),
  orderStatus: z.enum(OrderStatus, 'Order status is required'),
  total: z.number('Total is required').positive('Total must be positive'),
  items: z
    .array(orderItemSchema, 'Order items are required')
    .min(1, 'Order must contain at least one item'),
  firstName: z
    .string('First name is required')
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters')
    .nullable(),
  lastName: z
    .string('Last name is required')
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters')
    .nullable(),
  email: z.email('Invalid email').nullable(),
  phone: z.string().nullable().optional(),
  address: z
    .object({
      line1: z.string(),
      line2: z.string().nullable(),
      city: z.string(),
      state: z.string(),
      postal_code: z.string(),
      country: z.string(),
    })
    .nullable(),
})

export const orderUpdateSchema = z.object({
  paymentId: z.string('Payment ID is required'),
  fields: z
    .record(z.string(), z.unknown())
    .refine((fields) => Object.keys(fields).length > 0, {
      message: 'At least one field must be updated',
    }),
})
