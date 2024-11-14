import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { createUser, updateUserVerification } from '../repository'
import {
  validateLogin,
  validateRegistration,
  sendEmail,
  validateVerification,
} from '../services'
import { env, cookieOptions } from '../config'
import { signAccessToken, signRefreshToken } from '../utils'
import * as Errors from '../errors'
import type {
  LoginRequest,
  RegisterRequest,
  VerificationRequest,
} from '../types'

export const users = new Hono().basePath('/users')

users.post('/login', async (c) => {
  if (!env.cookieSecret) throw new Error('Cookie secret not set')
  if (!env.jwtRefreshSecret || !env.jwtRefreshExpiration)
    throw new Error('JWT refresh secret not set')

  try {
    const loginRequest = await c.req.json<LoginRequest>()
    const { uuid } = await validateLogin(loginRequest)
    const timestamp = Math.floor(Date.now() / 1000)

    const accessToken = await signAccessToken(uuid, timestamp)
    const refreshToken = await signRefreshToken(uuid, timestamp)

    setSignedCookie(
      c,
      'refresh-token',
      refreshToken,
      env.cookieSecret,
      cookieOptions,
    )

    return c.json({ accessToken })
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/register', async (c) => {
  try {
    if (!env.baseUrl) throw new Error('Base URL not set')

    const request = await c.req.json<RegisterRequest>()
    const user = await validateRegistration(request)

    const userResponse = await createUser(user)

    const codeLink = `${env.baseUrl}/users/verify?email=${userResponse.email}&code=${userResponse.verificationCode}`

    const emailResponse = await sendEmail(
      user.email,
      user.firstName,
      codeLink,
      env.baseUrl,
      'verification',
    )

    if (emailResponse.accepted.includes(user.email)) {
      return c.json({ email: userResponse.email })
    } else {
      throw new Error('Email not sent')
    }
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }
    if (error instanceof Error && error.message === 'Email not sent') {
      return c.json({ error: error.message }, 500)
    }
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.get('/verify', async (c) => {
  try {
    const request = c.req.query() as VerificationRequest

    const user = await validateVerification(request)
    const updatedUser = await updateUserVerification(user.email)

    return c.json(updatedUser)
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})
