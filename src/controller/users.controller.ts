import { Hono } from 'hono'
import { setSignedCookie, deleteCookie, getSignedCookie } from 'hono/cookie'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { validate, sendEmail } from '../services'
import { env, REFRESH_TOKEN, cookieOptions } from '../config'
import {
  signAccessToken,
  signRefreshToken,
  uploadFile,
  validateImage,
  verifyJWTRefresh,
} from '../utils'
import * as DB from '../repository'
import * as Errors from '../errors'
import type {
  LoginRequest,
  PasswordResetRequest,
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
      REFRESH_TOKEN,
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
    const registerRequest = await c.req.formData()
    const firstName = registerRequest.get('firstName')?.toString()
    const lastName = registerRequest.get('lastName')?.toString()
    const email = registerRequest.get('email')?.toString()
    const password = registerRequest.get('password')?.toString()
    const avatar = registerRequest.get('avatar')

    if (!firstName || !lastName || !email || !password) {
      throw new Errors.BadRequest(Errors.messages.fieldsRequired)
    }

    const user = await DB.getUserBy('email', email)

    if (user) {
      throw new Errors.BadRequest(Errors.messages.emailTaken)
    }

    const verificationToken = crypto.randomUUID()
    const verificationExpires = new Date(Date.now() + 86400000).toISOString()
    const tokenLink = `${env.clientBaseUrl}/verification?token=${verificationToken}`

    const emailResponse = await sendEmail(
      email,
      firstName,
      tokenLink,
      env.clientBaseUrl,
      'verification',
    )

    if (emailResponse.rejected.includes(email)) {
      throw new Error(Errors.messages.sendEmail)
    }

    const file = validateImage(avatar)
    const avatarUrl = file instanceof File ? await uploadFile(file) : null

    const newUser = {
      firstName,
      lastName,
      email,
      password,
      avatar: avatarUrl,
      verificationToken,
      verificationExpires,
    }

    const userCreated = await DB.createUser(newUser)

    if (!userCreated) {
      throw new Error(Errors.messages.createError)
    }

    return c.json({ email: userCreated.email })
  } catch (error) {
    if (error instanceof Errors.BaseError) {
      return c.json(
        { error: error.message },
        error.status as ContentfulStatusCode,
      )
    }
    if (error instanceof Error && error.message === Errors.messages.sendEmail) {
      return c.json({ error: error.message }, 500)
    }

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/verification', async (c) => {
  try {
    const verificationRequest = await c.req.json<TokenRequest>()

    const userValidated = await validate('verification', verificationRequest)

    const userUpdated = await DB.updateUser(userValidated.email, {
      verified: true,
      verificationToken: null,
      verificationExpires: null,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) {
      throw new Error(Errors.messages.updateError)
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

    const passwordResetToken = crypto.randomUUID()
    const passwordResetExpires = new Date(Date.now() + 86400000).toISOString()
    const tokenLink = `${env.clientBaseUrl}/password-reset?token=${passwordResetToken}`

    const emailResponse = await sendEmail(
      userValidated.email,
      userValidated.firstName,
      tokenLink,
      env.clientBaseUrl,
      'passwordReset',
    )

    if (emailResponse.rejected) {
      throw new Error(Errors.messages.sendEmail)
    }

    const userUpdated = await DB.updateUser(userValidated.email, {
      passwordResetToken,
      passwordResetExpires,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) {
      throw new Error(Errors.messages.updateError)
    }

    return c.status(200)
  } catch (error) {
    if (error instanceof Error && error.message === Errors.messages.sendEmail) {
      return c.json({ error: error.message }, 500)
    }

    return c.status(200)
  }
})

users.post('/password-reset-token', async (c) => {
  try {
    const passwordResetToken = await c.req.json<TokenRequest>()

    const userValidated = await validate(
      'passwordResetToken',
      passwordResetToken,
    )

    const userUpdated = await DB.updateUser(userValidated.email, {
      passwordResetToken: null,
      passwordResetExpires: null,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) {
      throw new Error(Errors.messages.updateError)
    }

    if (userValidated.message) {
      throw new Errors.Forbidden(userValidated.message)
    }

    return c.json({ email: userUpdated.email })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.get('/profile', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')

    const user = await DB.getUserBy('uuid', jwtPayload.uuid)

    if (!user) {
      throw new Error(Errors.messages.retrieveError)
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

    const user = await DB.getUserBy('uuid', jwtPayload.uuid)

    if (!user) {
      throw new Error(Errors.messages.retrieveError)
    }

    const updateFields = await c.req.json<UserUpdateRequest>()

    const userUpdated = await DB.updateUser(user.email, {
      ...updateFields,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) {
      throw new Error(Errors.messages.updateError)
    }

    return c.json({ message: 'User updated successfully' })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.post('/logout', (c) => {
  try {
    deleteCookie(c, REFRESH_TOKEN, cookieOptions)

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
      REFRESH_TOKEN,
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
        REFRESH_TOKEN,
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
