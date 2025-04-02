import { Hono } from 'hono'
import { uploadFile, validateImage } from '../utils'
import * as DB from '../repository'
import * as Errors from '../errors'

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
      throw new Error(Errors.messages.retrieveError)
    }

    const formData = await c.req.formData()
    const avatar = formData.get('avatar')
    const file = validateImage(avatar)

    if (typeof file === 'string') {
      return c.json({ error: file }, 400)
    }

    const url = await uploadFile(file)

    const userUpdated = await DB.updateUser(user.email, {
      avatar: url,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) {
      throw new Error(Errors.messages.updateError)
    }

    return c.json(userUpdated)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
