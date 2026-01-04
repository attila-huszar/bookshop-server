import { z } from 'zod'
import { MAX_IMAGE_SIZE } from '@/constants'

export const idSchema = z.coerce
  .number({ message: 'ID must be a number' })
  .int('ID must be an integer')
  .positive('ID must be positive')

export const entityWithIdSchema = z.object({
  id: idSchema,
})

export const idsSchema = z.array(idSchema).min(1, 'At least one ID is required')

export const paymentIdSchema = z
  .string()
  .min(1, 'Payment ID is required')
  .startsWith('pi_', 'Invalid payment intent ID format')

export const imageSchema = z
  .object({
    size: z
      .number()
      .max(MAX_IMAGE_SIZE * 1024, `Image too large (max ${MAX_IMAGE_SIZE} KB)`),
    type: z.string().startsWith('image/', { message: 'Invalid file type' }),
  })
  .refine((data) => data.size > 0, {
    message: 'Image size must be greater than 0',
  })
