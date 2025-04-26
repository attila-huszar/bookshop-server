import { z } from 'zod'
import { OrderStatus, paymentIntentStatusValues } from '../types'

export const orderItemSchema = z.object({
  id: z.number({ required_error: 'Order item ID is required' }),
  title: z.string({ required_error: 'Title is required' }),
  price: z
    .number({ required_error: 'Price is required' })
    .positive('Price must be positive'),
  discount: z
    .number()
    .min(0, 'Discount must be at least 0')
    .max(100, 'Discount cannot exceed 100'),
  quantity: z
    .number({ required_error: 'Quantity is required' })
    .int('Quantity must be an integer')
    .positive('Quantity must be positive'),
})

export const orderCreateSchema = z.object({
  paymentId: z.string({ required_error: 'Payment ID is required' }),
  paymentIntentStatus: z.enum(paymentIntentStatusValues, {
    required_error: 'Payment intent status is required',
  }),
  orderStatus: z.nativeEnum(OrderStatus, {
    required_error: 'Order status is required',
  }),
  total: z
    .number({ required_error: 'Total is required' })
    .positive('Total must be positive'),
  currency: z.string({ required_error: 'Currency is required' }),
  items: z
    .array(orderItemSchema, { required_error: 'Order items are required' })
    .min(1, 'Order must contain at least one item'),
  firstName: z
    .string({ required_error: 'First name is required' })
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters')
    .optional(),
  lastName: z
    .string({ required_error: 'Last name is required' })
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters')
    .optional(),
  email: z
    .string({ required_error: 'Email is required' })
    .email('Invalid email format')
    .optional(),
  phone: z.string().nullable().optional(),
  address: z
    .object({
      line1: z.string().nullable(),
      line2: z.string().nullable(),
      city: z.string().nullable(),
      state: z.string().nullable(),
      postal_code: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable()
    .optional(),
})

export const orderUpdateSchema = z.object({
  paymentId: z.string({ required_error: 'Payment ID is required' }),
  fields: z
    .record(z.unknown())
    .refine((fields) => Object.keys(fields).length > 0, {
      message: 'At least one field must be updated',
    }),
})
