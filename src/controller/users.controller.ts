import { Hono } from 'hono'
import { getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie'
import { createUser, updateUser } from '../repository'
import { validate, sendEmail } from '../services'
import { env, cookieOptions } from '../config'
import { signAccessToken, signRefreshToken, verifyJWTRefresh } from '../utils'
import * as Errors from '../errors'
import type {
  LoginRequest,
  PasswordResetRequest,
  RegisterRequest,
  TokenRequest,
} from '../types'

export const users = new Hono()

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

    const { httpOnly, path, ...loginCookieOptions } = cookieOptions
    setCookie(c, 'uuid', userValidated.uuid, loginCookieOptions)

    return c.json({ accessToken, firstName: userValidated.firstName })
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/register', async (c) => {
  try {
    if (!env.clientBaseUrl) throw new Error('Client Base URL not set')

    const registerRequest = await c.req.json<RegisterRequest>()

    const userValidated = await validate('registration', registerRequest)

    const userCreated = await createUser(userValidated)

    const tokenLink = `${env.clientBaseUrl}/verification?token=${userCreated.verificationToken}`

    const emailResponse = await sendEmail(
      userValidated.email,
      userValidated.firstName,
      tokenLink,
      env.clientBaseUrl,
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

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/verification', async (c) => {
  try {
    const verificationRequest = await c.req.json<TokenRequest>()

    const userValidated = await validate('verification', verificationRequest)

    const userUpdated = await updateUser(userValidated.email, {
      verified: true,
      verificationToken: null,
      verificationExpires: null,
      updatedAt: new Date().toISOString(),
    })

    return c.json({ email: userUpdated.email })
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/password-reset-request', async (c) => {
  try {
    if (!env.clientBaseUrl) throw new Error('Client Base URL not set')

    const passwordResetRequest = await c.req.json<PasswordResetRequest>()

    const userValidated = await validate(
      'passwordResetRequest',
      passwordResetRequest,
    )

    const userUpdated = await updateUser(userValidated.email, {
      passwordResetToken: crypto.randomUUID(),
      passwordResetExpires: new Date(Date.now() + 86400000).toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const tokenLink = `${env.clientBaseUrl}/password-reset?token=${userUpdated.passwordResetToken}`

    const emailResponse = await sendEmail(
      userUpdated.email,
      userUpdated.firstName,
      tokenLink,
      env.clientBaseUrl,
      'passwordReset',
    )

    if (emailResponse.accepted.includes(userUpdated.email)) {
      return c.json({ email: userUpdated.email })
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

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/password-reset-token', async (c) => {
  try {
    const passwordResetToken = await c.req.json<TokenRequest>()

    const userValidated = await validate(
      'passwordResetToken',
      passwordResetToken,
    )

    const userUpdated = await updateUser(userValidated.email, {
      passwordResetToken: null,
      passwordResetExpires: null,
      updatedAt: new Date().toISOString(),
    })

    return c.json({ email: userUpdated.email })
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json({ error: error.message }, error.status)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/refresh', async (c) => {
  if (!env.cookieSecret) throw new Error('Cookie secret not set')
  if (!env.jwtAccessSecret || !env.jwtAccessExpiration)
    throw new Error('JWT access secret not set')
  if (!env.jwtRefreshSecret || !env.jwtRefreshExpiration)
    throw new Error('JWT refresh secret not set')

  try {
    const refreshTokenCookie = await getSignedCookie(
      c,
      env.cookieSecret,
      'refresh-token',
    )

    if (!refreshTokenCookie) {
      return c.json({ error: 'No refresh token provided' }, 401)
    }

    const payload = (await verifyJWTRefresh(refreshTokenCookie)) as {
      uuid: string
      exp: number
      iat: number
    }

    const expTimestamp = payload.exp ?? 0
    const timestamp = Math.floor(Date.now() / 1000)

    if (expTimestamp - 259200 < timestamp) {
      if (!env.cookieSecret) throw new Error('Cookie secret not set')

      const refreshToken = await signRefreshToken(payload.uuid, timestamp)
      await setSignedCookie(
        c,
        'refresh-token',
        refreshToken,
        env.cookieSecret,
        cookieOptions,
      )

      const { httpOnly, path, ...loginCookieOptions } = cookieOptions
      setCookie(c, 'uuid', payload.uuid, loginCookieOptions)
    }

    const accessToken = await signAccessToken(payload.uuid, timestamp)

    return c.json({ accessToken })
  } catch (error) {
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})
