import { Hono } from 'hono'
import { setSignedCookie, deleteCookie, getSignedCookie } from 'hono/cookie'
import { createUser, getUserBy, updateUser } from '../repository'
import { validate, sendEmail } from '../services'
import { env, cookieOptions } from '../config'
import { signAccessToken, signRefreshToken, verifyJWTRefresh } from '../utils'
import * as Errors from '../errors'
import type {
  LoginRequest,
  PasswordResetRequest,
  RegisterRequest,
  TokenRequest,
  UserUpdateRequest,
} from '../types'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const users = new Hono<{ Variables: Variables }>()

users.post('/login', async (c) => {
  try {
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
    return Errors.Handler(c, error)
  }
})

users.post('/register', async (c) => {
  try {
    const registerRequest = await c.req.json<RegisterRequest>()

    const userValidated = await validate('registration', registerRequest)

    const userCreated = await createUser(userValidated)

    if (!userCreated) {
      throw new Error('User not created')
    }

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

    if (!userUpdated) {
      throw new Error('User not updated')
    }

    return c.json({ email: userUpdated.email })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.post('/password-reset-request', async (c) => {
  try {
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

    if (!userUpdated) {
      throw new Error('User not updated')
    }

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

    if (!userUpdated) {
      throw new Error('User not updated')
    }

    return c.json({ email: userUpdated.email })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.get('/profile', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')

    const user = await getUserBy('uuid', jwtPayload.uuid)

    if (!user) {
      throw new Error("User doesn't exist")
    }

    const {
      id,
      uuid,
      password,
      verified,
      verificationToken,
      verificationExpires,
      passwordResetToken,
      passwordResetExpires,
      createdAt,
      updatedAt,
      ...userWithoutCreds
    } = user

    return c.json(userWithoutCreds)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.patch('/profile', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')

    const user = await getUserBy('uuid', jwtPayload.uuid)

    if (!user) {
      throw new Error("User doesn't exist")
    }

    const updateFields = await c.req.json<UserUpdateRequest>()

    const userUpdated = await updateUser(user.email, {
      ...updateFields,
      updatedAt: new Date().toISOString(),
    })

    return c.json(userUpdated)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.post('/logout', (c) => {
  try {
    deleteCookie(c, 'refresh-token', cookieOptions)

    return c.json({ message: 'Logged out successfully' })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.post('/refresh', async (c) => {
  try {
    const refreshTokenCookie = await getSignedCookie(
      c,
      env.cookieSecret,
      'refresh-token',
    )

    if (!refreshTokenCookie) {
      return c.json({ message: 'No user session' }, 200)
    }

    const payload = (await verifyJWTRefresh(refreshTokenCookie)) as {
      uuid: string
      exp: number
      iat: number
    }

    const expTimestamp = payload.exp ?? 0
    const timestamp = Math.floor(Date.now() / 1000)

    if (expTimestamp - 259200 < timestamp) {
      const refreshToken = await signRefreshToken(payload.uuid, timestamp)
      await setSignedCookie(
        c,
        'refresh-token',
        refreshToken,
        env.cookieSecret,
        cookieOptions,
      )
    }

    const accessToken = await signAccessToken(payload.uuid, timestamp)

    return c.json({ accessToken })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
