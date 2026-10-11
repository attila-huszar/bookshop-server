import { z } from 'zod'
import { countrySchema, imageSchema, nameSchema } from './commonSchemas'

export const emailSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email('Invalid email'))
    .transform((email) => email.toLowerCase()),
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
  firstName: nameSchema,
  lastName: nameSchema,
  ...emailSchema.shape,
  ...passwordSchema.shape,
  country: countrySchema,
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
