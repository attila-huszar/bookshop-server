import { usersDB } from '@/repositories'
import { imageSchema, validate } from '@/validation'
import { uploadFile } from '@/utils'
import { userMessage } from '@/constants'

export async function handleAvatarUpload(
  userUuid: string,
  avatar: Bun.FormDataEntryValue | null,
) {
  const user = await usersDB.getUserBy('uuid', userUuid)

  if (!user) {
    throw new Error(userMessage.getError)
  }

  if (!(avatar instanceof File)) {
    throw new Error('Avatar must be a file')
  }

  validate(imageSchema, avatar)

  const url = await uploadFile(avatar)

  const userUpdated = await usersDB.updateUser(user.email, {
    avatar: url,
    updatedAt: new Date().toISOString(),
  })

  if (!userUpdated) {
    throw new Error(userMessage.updateError)
  }

  const {
    id,
    uuid,
    password,
    verified,
    verificationToken,
    verificationExpires,
    passwordResetToken,
    passwordResetExpires,
    createdAt,
    updatedAt,
    ...userWithoutCreds
  } = userUpdated

  return userWithoutCreds
}
