import { usersDB } from '../repositories'
import { imageUploadSchema, validate } from '../validation'
import { uploadFile } from '../utils'
import { userMessage } from '../constants'

export async function handleAvatarUpload(userUuid: string, avatar: unknown) {
  const user = await usersDB.getUserBy('uuid', userUuid)

  if (!user) {
    throw new Error(userMessage.retrieveError)
  }

  const validationResult = validate(imageUploadSchema, avatar)

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const url = await uploadFile(validationResult.data.avatar)

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

  return { user: userWithoutCreds }
}
