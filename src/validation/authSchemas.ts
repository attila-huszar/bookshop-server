import { z } from 'zod'
import { imageSchema } from './commonSchemas'

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

export const loginSchema = z.strictObject({
  ...emailSchema.shape,
  ...passwordSchema.shape,
})

export const registerSchema = z.object({
  firstName: z
    .string('First name is required')
    .max(100, 'First name must be less than 100 characters'),
  lastName: z
    .string('Last name is required')
    .max(100, 'Last name must be less than 100 characters'),
  ...emailSchema.shape,
  ...passwordSchema.shape,
  country: z
    .string('Country is required')
    .length(2, 'Country code must be 2 characters (ISO 3166-1 alpha-2)')
    .toLowerCase(),
  avatar: imageSchema.nullable(),
})

export const passwordResetSchema = z.strictObject({
  ...tokenSchema.shape,
  ...passwordSchema.shape,
})

export const authJWTPayloadSchema = z.looseObject({
  uuid: z.uuid('Invalid auth token uuid'),
  exp: z.number().optional(),
  iat: z.number().optional(),
})
