import { users } from '../repository'

export type UserResponse = Omit<
  typeof users.$inferSelect,
  | 'id'
  | 'password'
  | 'verificationCode'
  | 'verificationExpires'
  | 'passwordResetCode'
  | 'passwordResetExpires'
>
