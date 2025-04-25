import { z } from 'zod'
import { usersTable } from '../repositories'
import type {
  loginSchema,
  registerSchema,
  verificationSchema,
  passwordResetRequestSchema,
  passwordResetTokenSchema,
} from '../validation'

export type User = typeof usersTable.$inferSelect

export type LoginRequest = z.infer<typeof loginSchema>

export type RegisterRequest = z.infer<typeof registerSchema>

export type VerificationRequest = z.infer<typeof verificationSchema>

export type PasswordResetRequest = z.infer<typeof passwordResetRequestSchema>

export type PasswordResetTokenRequest = z.infer<typeof passwordResetTokenSchema>

export type TokenRequest = {
  token: string
}

export type UserUpdateRequest = Partial<Omit<User, 'id' | 'uuid' | 'createdAt'>>
