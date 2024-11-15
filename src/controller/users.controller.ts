import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { createUser, updateUser } from '../repository'
import { validate, sendEmail } from '../services'
import { env, cookieOptions } from '../config'
import { signAccessToken, signRefreshToken } from '../utils'
import * as Errors from '../errors'
import type {
  LoginRequest,
  PasswordResetRequest,
  RegisterRequest,
  TokenRequest,
} from '../types'

export const users = new Hono().basePath('/users')

users.post('/login', async (c) => {
  try {
    if (!env.cookieSecret) throw new Error('Cookie secret not set')
    if (!env.jwtRefreshSecret || !env.jwtRefreshExpiration)
      throw new Error('JWT refresh secret not set')

    const loginRequest = await c.req.json<LoginRequest>()

    const userValidated = await validate('login', loginRequest)

    const timestamp = Math.floor(Date.now() / 1000)

    const accessToken = await signAccessToken(userValidated.uuid, timestamp)
    const refreshToken = await signRefreshToken(userValidated.uuid, timestamp)

    await setSignedCookie(
      c,
      'refresh-token',
      refreshToken,
      env.cookieSecret,
      cookieOptions,
    )

    return c.json({ accessToken, firstName: userValidated.firstName })
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

    const registerRequest = await c.req.json<RegisterRequest>()

    const userValidated = await validate('registration', registerRequest)

    const userCreated = await createUser(userValidated)

    const codeLink = `${env.baseUrl}/users/verify?token=${userCreated.verificationCode}`

    const emailResponse = await sendEmail(
      userValidated.email,
      userValidated.firstName,
      codeLink,
      env.baseUrl,
      'verification',
    )

    if (emailResponse.accepted.includes(userValidated.email)) {
      return c.json({ email: userValidated.email })
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

users.post('/verify', async (c) => {
  try {
    const verifyRequest = await c.req.json<TokenRequest>()

    const userValidated = await validate('verification', verifyRequest)

    const userUpdated = await updateUser(userValidated.email, {
      verified: true,
      verificationCode: null,
      verificationExpires: null,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) throw new Error('User not found')

    return c.json({ email: userUpdated.email })
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/password-reset', async (c) => {
  try {
    if (!env.baseUrl) throw new Error('Base URL not set')

    const passwordResetRequest = await c.req.json<PasswordResetRequest>()

    const userValidated = await validate(
      'passwordResetRequest',
      passwordResetRequest,
    )

    const userUpdated = await updateUser(userValidated.email, {
      passwordResetCode: crypto.randomUUID(),
      passwordResetExpires: new Date(Date.now() + 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated)
      throw new Error('Could not update user with password reset data')

    const codeLink = `${env.baseUrl}/users/password-reset?token=${userUpdated.passwordResetCode}`

    const emailResponse = await sendEmail(
      userUpdated.email,
      userUpdated.firstName,
      codeLink,
      env.baseUrl,
      'passwordReset',
    )

    if (emailResponse.accepted.includes(userUpdated.email)) {
      return c.json({ email: userUpdated.email })
    } else {
      throw new Error('Could not send email')
    }
  } catch (error) {
    console.error(error)
  }
})
