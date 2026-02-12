import type { PublicUser, User } from '@/types'

export function stripSensitiveUserFields(user: User): PublicUser {
  const {
    id,
    password,
    verified,
    verificationToken,
    verificationExpires,
    passwordResetToken,
    passwordResetExpires,
    createdAt,
    updatedAt,
    ...publicUser
  } = user

  return publicUser
}
