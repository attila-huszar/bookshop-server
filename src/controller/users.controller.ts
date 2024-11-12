import { Hono } from 'hono'
import { getUserByUUID, getUserByEmail } from '../repository'
import * as Errors from '../errors'

export const users = new Hono().basePath('/users')

users.get('/', async (c) => {
  const { email, uuid } = c.req.query()

  try {
    if (email) {
      const user = await getUserByEmail(email)
      return c.json(user)
    }

    if (uuid) {
      const user = await getUserByUUID(uuid)
      return c.json(user)
    }

    throw new Errors.BadRequestError('Bad Request')
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})
