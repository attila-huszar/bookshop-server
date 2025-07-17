import { z } from 'zod'
import { usersTable } from '../repositories'
import type {
  loginSchema,
  registerSchema,
  emailSchema,
  tokenSchema,
  passwordResetSchema,
} from '../validation'

export type User = typeof usersTable.$inferSelect

export type LoginRequest = z.infer<typeof loginSchema>
export type RegisterRequest = z.infer<typeof registerSchema>
export type VerificationRequest = z.infer<typeof tokenSchema>
export type PasswordResetRequest = z.infer<typeof emailSchema>
export type PasswordResetToken = z.infer<typeof tokenSchema>
export type PasswordResetSubmit = z.infer<typeof passwordResetSchema>
export type UserUpdateRequest = Partial<Omit<User, 'id' | 'uuid' | 'createdAt'>>

export const enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}
