import { z } from 'zod'
import type {
  userSelectSchema,
  userInsertSchema,
  userUpdateSchema,
  loginSchema,
  registerSchema,
  emailSchema,
  tokenSchema,
  passwordResetSchema,
} from '@/validation'

export type User = z.infer<typeof userSelectSchema>
export type UserInsert = z.infer<typeof userInsertSchema>
export type UserUpdate = z.infer<typeof userUpdateSchema>

export type LoginRequest = z.infer<typeof loginSchema>
export type RegisterRequest = z.infer<typeof registerSchema>
export type VerificationRequest = z.infer<typeof tokenSchema>
export type PasswordResetRequest = z.infer<typeof emailSchema>
export type PasswordResetToken = z.infer<typeof tokenSchema>
export type PasswordResetSubmit = z.infer<typeof passwordResetSchema>

export enum UserRole {
  Admin = 'admin',
  User = 'user',
}
