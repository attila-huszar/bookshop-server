import { Hono } from 'hono'
import { imageUploadSchema, validate } from '../validation'
import { uploadFile } from '../utils'
import { userMessage } from '../constants'
import { errorHandler } from '../errors'
import * as DB from '../repository'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const upload = new Hono<{ Variables: Variables }>()

upload.post('/', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')

    const user = await DB.getUserBy('uuid', jwtPayload.uuid)

    if (!user) {
      throw new Error(userMessage.retrieveError)
    }

    const formData = await c.req.formData()
    const avatar = formData.get('avatar')

    const validationResult = validate(imageUploadSchema, avatar)

    if (validationResult.error) {
      return c.json({ error: validationResult.error }, 400)
    }

    const url = await uploadFile(validationResult.data.avatar)

    const userUpdated = await DB.updateUser(user.email, {
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

    return c.json(userWithoutCreds)
  } catch (error) {
    return errorHandler(c, error)
  }
})
