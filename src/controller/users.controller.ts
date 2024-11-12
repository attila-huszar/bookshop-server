import { Hono } from 'hono'
import { createUser } from '../repository'
import {
  validateLogin,
  validateRegistration,
  sendEmail,
  validateVerification,
} from '../services'
import * as Error from '../errors'
import type {
  LoginRequest,
  RegisterRequest,
  VerificationRequest,
} from '../types'

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

    const emailResponse = await sendEmail(user.email, 'verification')

    if (emailResponse.accepted.includes(user.email)) {
      const userResponse = await createUser(user)

      return c.json(userResponse)
    } else {
      throw new Error.BadRequest('Email not sent')
    }
  } catch (error) {
    if (error instanceof Error.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/verify', async (c) => {
  try {
    const request = await c.req.json<VerificationRequest>()
    const email = await validateVerification(request)

    return c.json(email)
  } catch (error) {
    if (error instanceof Error.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})
