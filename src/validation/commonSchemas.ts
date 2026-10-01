import { z } from 'zod'
import { MAX_IMAGE_SIZE } from '@/constants'

export const idSchema = z
  .union([z.number(), z.string().regex(/^\d+$/)])
  .pipe(
    z.coerce
      .number<string | number>()
      .int()
      .positive()
      .max(Number.MAX_SAFE_INTEGER),
  )

export const nameSchema = z.string().trim().min(1).max(100)

export const countrySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, 'Invalid country code')
  .toLowerCase()

export const phoneSchema = z
  .string()
  .regex(
    /^(\+?\d{0,4})?\s?-?\s?(\(?\d{3}\)?)\s?-?\s?(\(?\d{3}\)?)\s?-?\s?(\(?\d{4}\)?)?$/,
    'Invalid phone number',
  )
  .or(z.literal(''))

export const addressSchema = z.object({
  city: z.string().max(100).nullable().default(null),
  country: countrySchema.or(z.literal('')).nullable().default(null),
  line1: z.string().max(200).nullable().default(null),
  line2: z.string().max(200).nullable().default(null),
  postal_code: z.string().max(30).nullable().default(null),
  state: z.string().max(100).nullable().default(null),
})

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

export const uuidSchema = z.uuid()
