import { Hono } from 'hono'
import { validateLogin, validateRegistration } from '../services'
import * as Error from '../errors'
import type { LoginRequest, RegisterRequest } from '../types'
import { createUser } from '../repository/users.repo'

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

users.post('/register', async (c) => {
  try {
    const request = await c.req.json<RegisterRequest>()
    const user = await validateRegistration(request)

    const email = await createUser(user)

    return c.json(email)
  } catch (error) {
    if (error instanceof Error.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})
