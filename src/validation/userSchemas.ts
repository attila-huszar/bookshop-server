import { z } from 'zod'
import { MAX_IMAGE_SIZE } from '@/constants'

export const emailSchema = z.object({
  email: z.email('Invalid email'),
})

export const passwordSchema = z.object({
  password: z
    .string('Password is required')
    .min(6, 'Password must be at least 6 characters')
    .regex(
      /^(?=.*[a-z])(?=.*\d)/,
      'Password must contain at least one letter and one number',
    ),
})

export const tokenSchema = z.object({
  token: z.uuid('Invalid verification token'),
})

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

export const loginSchema = z
  .object({
    ...emailSchema.shape,
    ...passwordSchema.shape,
  })
  .strict()

export const registerSchema = z.object({
  firstName: z
    .string('First name is required')
    .min(2, 'First name must be at least 2 characters')
    .max(50, 'First name must be less than 50 characters'),
  lastName: z
    .string('Last name is required')
    .min(2, 'Last name must be at least 2 characters')
    .max(50, 'Last name must be less than 50 characters'),
  ...emailSchema.shape,
  ...passwordSchema.shape,
  country: z
    .string('Country is required')
    .length(2, 'Country code must be 2 characters (ISO 3166-1 alpha-2)')
    .toLowerCase(),
  avatar: imageSchema.nullable(),
})

export const passwordResetSchema = z
  .object({
    ...tokenSchema.shape,
    ...passwordSchema.shape,
  })
  .strict()
