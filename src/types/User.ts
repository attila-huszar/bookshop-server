import { users } from '../repository'

export type LoginRequest = {
  email: string
  password: string
}

export type RegisterRequest = {
  firstName: string
  lastName: string
  email: string
  password: string
}

export type VerificationRequest = {
  email: string
  code: string
}

export type UserFields = typeof users.$inferSelect
