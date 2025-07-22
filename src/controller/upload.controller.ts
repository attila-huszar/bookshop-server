import { Hono } from 'hono'
import { handleAvatarUpload } from '@/services'
import { errorHandler } from '@/errors'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const upload = new Hono<{ Variables: Variables }>()

upload.post('/', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')
    const formData = await c.req.formData()
    const avatar = formData.get('avatar')

    const user = await handleAvatarUpload(jwtPayload.uuid, avatar)

    return c.json(user)
  } catch (error) {
    return errorHandler(c, error)
  }
})
