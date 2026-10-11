import type { z } from 'zod'
import type {
  authJWTPayloadSchema,
  cmsUserIdsSchema,
  cmsUserInsertSchema,
  cmsUserUpdateSchema,
  emailSchema,
  loginSchema,
  passwordResetSchema,
  profileUpdateSchema,
  registerSchema,
  tokenSchema,
  userInsertSchema,
  userSelectSchema,
  userUpdateSchema,
} from '@/validation'

/** Internal database record; API responses use explicit public field lists. */
export type User = z.infer<typeof userSelectSchema>
export type UserInsert = z.infer<typeof userInsertSchema>
export type UserRegistrationInsert = UserInsert & {
  verified: false
  verificationToken: string
  verificationExpires: Date
}
export type PasswordResetTokenUpdate = { token: string; expiresAt: Date }
export type UserUpdate = z.infer<typeof userUpdateSchema>
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>
export type CmsUserInsert = z.infer<typeof cmsUserInsertSchema>
export type CmsUserUpdate = z.infer<typeof cmsUserUpdateSchema>
export type CmsUserIds = z.infer<typeof cmsUserIdsSchema>

export type LoginRequest = z.infer<typeof loginSchema>
export type RegisterRequest = z.infer<typeof registerSchema>
export type VerificationRequest = z.infer<typeof tokenSchema>
export type PasswordResetRequest = z.infer<typeof emailSchema>
export type PasswordResetToken = z.infer<typeof tokenSchema>
export type PasswordResetSubmit = z.infer<typeof passwordResetSchema>

/** Profile/checkout data only; adding a database field does not expose it here. */
export type PublicUser = Pick<
  User,
  | 'uuid'
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'country'
  | 'phone'
  | 'address'
  | 'avatar'
  | 'role'
>

export type UserLookupField = Extract<
  keyof User,
  'id' | 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken'
>

export type AuthJWTPayload = z.infer<typeof authJWTPayloadSchema>

/** Internal request state; responses must use the user response allowlists. */
export type AuthVariables = {
  jwtPayload: { uuid: string }
  authUser: User
}
