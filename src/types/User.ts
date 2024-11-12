import { users } from '../repository'

export type LoginRequest = {
  email: string
  password: string
}

export type UserFields = typeof users.$inferSelect
