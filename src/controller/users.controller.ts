import { Hono } from 'hono'
import { createUser, verifyUser } from '../repository'
import {
  validateLogin,
  validateRegistration,
  sendEmail,
  validateVerification,
} from '../services'
import { baseUrl } from '../config/constants'
import * as Errors from '../errors'
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
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/register', async (c) => {
  try {
    if (!baseUrl) {
      throw new Error('Base URL not set')
    }

    const request = await c.req.json<RegisterRequest>()
    const user = await validateRegistration(request)

    const userResponse = await createUser(user)

    const codeLink = `${baseUrl}/users/verify?email=${userResponse.email}&code=${userResponse.verificationCode}`

    const emailResponse = await sendEmail(
      user.email,
      user.firstName,
      codeLink,
      baseUrl,
      'verification',
    )

    if (emailResponse.accepted.includes(user.email)) {
      return c.json({ email: userResponse.email })
    } else {
      throw new Errors.BadRequest('Email not sent')
    }
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.get('/verify', async (c) => {
  try {
    const request = c.req.query() as VerificationRequest

    const user = await validateVerification(request)

    const updatedUser = await verifyUser(user.email)

    return c.json(updatedUser)
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})
