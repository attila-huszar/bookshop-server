import type { PublicUser, User } from '@/types'

export const stripSensitiveUserFields = (user: User): PublicUser => {
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

export const stripTimestamps = <T extends { createdAt: Date; updatedAt: Date }>(
  entity: T,
): WithoutTS<T> => {
  const { createdAt, updatedAt, ...rest } = entity
  return rest
}
