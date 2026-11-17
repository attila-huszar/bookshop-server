import type { TokenPayload } from 'google-auth-library'
import { z } from 'zod'
import { validationLimits } from '@/constants/validation'
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
    .min(
      validationLimits.password.minLength,
      `Password must be at least ${validationLimits.password.minLength} characters`,
    )
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
  password: z.string().min(1, 'Password is required'),
})

export const googleLoginSchema = z.strictObject({
  credential: z.string().min(1).max(10_000),
})

type GoogleClaimSchemas = {
  [Claim in keyof TokenPayload]?: z.ZodType<TokenPayload[Claim]>
}

export const googleIdentitySchema = z.object({
  sub: z.string().min(1).max(255),
  email: emailSchema.shape.email,
  email_verified: z.literal(true),
  nonce: z.string().min(1),
  hd: z.string().optional(),
  given_name: nameSchema.optional(),
  family_name: nameSchema.optional(),
  name: nameSchema.optional(),
} satisfies GoogleClaimSchemas)

export type GoogleIdentity = z.infer<typeof googleIdentitySchema>

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
