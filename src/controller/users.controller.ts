import { Hono } from 'hono'
import { validateLogin } from '../services'
import * as Error from '../errors'
import type { LoginRequest } from '../types'

export const users = new Hono().basePath('/users')

users.post('/login', async (c) => {
  try {
    const body = await c.req.json<LoginRequest>()
    const uuid = await validateLogin(body)

    return c.json(uuid)
  } catch (error) {
    if (error instanceof Error.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})
