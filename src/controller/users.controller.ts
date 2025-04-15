import { Hono } from 'hono'
import { setSignedCookie, deleteCookie, getSignedCookie } from 'hono/cookie'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { validate, schemas, formatZodError } from '../validation'
import { env, REFRESH_TOKEN, cookieOptions } from '../config'
import { sendEmail, logger } from '../services'
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

    const validationResult = validate(schemas.login, loginRequest)

    if (!validationResult.success) {
      return c.json({ error: formatZodError(validationResult.error) }, 400)
    }

    const validatedData = validationResult.data

    const user = await DB.getUserBy('email', validatedData.email)

    if (!user) {
      throw new Errors.Unauthorized(Errors.messages.emailOrPasswordError)
    }

    if (!user.verified) {
      throw new Errors.Forbidden(Errors.messages.verifyFirst)
    }

    const isPasswordCorrect = await Bun.password.verify(
      validatedData.password,
      user.password,
    )

    if (!isPasswordCorrect) {
      throw new Errors.Unauthorized(Errors.messages.emailOrPasswordError)
    }

    const timestamp = Math.floor(Date.now() / 1000)

    const accessToken = await signAccessToken(user.uuid, timestamp)
    const refreshToken = await signRefreshToken(user.uuid, timestamp)

    await setSignedCookie(
      c,
      REFRESH_TOKEN,
      refreshToken,
      env.cookieSecret!,
      cookieOptions,
    )

    return c.json({ accessToken, firstName: user.firstName })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

users.post('/register', async (c) => {
  try {
    const registerRequest = await c.req.formData()

    const formData = {
      firstName: registerRequest.get('firstName'),
      lastName: registerRequest.get('lastName'),
      email: registerRequest.get('email'),
      password: registerRequest.get('password'),
      avatar: registerRequest.get('avatar'),
    }

    const validationResult = validate(schemas.register, formData)

    if (!validationResult.success) {
      return c.json({ error: formatZodError(validationResult.error) }, 400)
    }

    const validatedRequest = validationResult.data

    const existingUser = await DB.getUserBy('email', validatedRequest.email)
    if (existingUser) {
      throw new Errors.BadRequest(Errors.messages.emailTaken)
    }

    const verificationToken = crypto.randomUUID()
    const verificationExpires = new Date(Date.now() + 86400000).toISOString()
    const tokenLink = `${env.clientBaseUrl}/verification?token=${verificationToken}`

    const emailResponse = await sendEmail({
      toAddress: validatedRequest.email,
      toName: validatedRequest.firstName,
      tokenLink,
      baseLink: env.clientBaseUrl!,
      type: 'verification',
    })

    if (!emailResponse.accepted.includes(validatedRequest.email)) {
      throw new Error(Errors.messages.sendEmail)
    }

    const image = validateImage(validatedRequest.avatar)

    const avatarUrl = image instanceof File ? await uploadFile(image) : null

    const newUser = {
      ...validatedRequest,
      uuid: crypto.randomUUID(),
      role: 'user' as const,
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

    return c.json({ error: 'Internal server error' }, 500)
  }
})

users.post('/verification', async (c) => {
  try {
    const verificationRequest = await c.req.json<TokenRequest>()

    const validationResult = validate(schemas.verification, verificationRequest)

    if (!validationResult.success) {
      return c.json({ error: formatZodError(validationResult.error) }, 400)
    }

    const { token } = validationResult.data

    const user = await DB.getUserBy('verificationToken', token)

    if (!user?.verificationToken || !user.verificationExpires) {
      throw new Errors.BadRequest(Errors.messages.tokenInvalid)
    }

    const expirationDate = new Date(user.verificationExpires)

    if (expirationDate < new Date()) {
      throw new Errors.Forbidden(Errors.messages.tokenExpired)
    }

    const userUpdated = await DB.updateUser(user.email, {
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

    const validationResult = validate(
      schemas.passwordResetRequest,
      passwordResetRequest,
    )

    if (!validationResult.success) {
      return c.json({ error: formatZodError(validationResult.error) }, 400)
    }

    const { email } = validationResult.data

    const user = await DB.getUserBy('email', email)

    if (!user) {
      void logger.info(`Password reset request for non-existing user: ${user}`)

      return c.json({
        message:
          "If you're registered with us, you'll receive a password reset link shortly.",
      })
    }

    const passwordResetToken = crypto.randomUUID()
    const passwordResetExpires = new Date(Date.now() + 86400000).toISOString()
    const tokenLink = `${env.clientBaseUrl}/password-reset?token=${passwordResetToken}`

    const emailResponse = await sendEmail({
      toAddress: user.email,
      toName: user.firstName,
      tokenLink,
      baseLink: env.clientBaseUrl!,
      type: 'passwordReset',
    })

    if (!emailResponse.accepted.includes(user.email)) {
      throw new Error(Errors.messages.sendEmail)
    }

    const userUpdated = await DB.updateUser(user.email, {
      passwordResetToken,
      passwordResetExpires,
      updatedAt: new Date().toISOString(),
    })

    if (!userUpdated) {
      throw new Error(Errors.messages.updateError)
    }

    return c.json({
      message:
        "If you're registered with us, you'll receive a password reset link shortly.",
    })
  } catch (error) {
    void logger.error('Error in password reset request', { error })
    return c.json({
      message:
        "If you're registered with us, you'll receive a password reset link shortly.",
    })
  }
})

users.post('/password-reset-token', async (c) => {
  try {
    const passwordResetTokenRequest = await c.req.json<TokenRequest>()

    const validationResult = validate(
      schemas.passwordResetToken,
      passwordResetTokenRequest,
    )

    if (!validationResult.success) {
      return c.json({ error: formatZodError(validationResult.error) }, 400)
    }

    const { token, password } = validationResult.data

    const user = await DB.getUserBy('passwordResetToken', token)

    if (!user?.passwordResetToken || !user.passwordResetExpires) {
      throw new Errors.BadRequest(Errors.messages.tokenInvalid)
    }

    const expirationDate = new Date(user.passwordResetExpires)

    if (expirationDate < new Date()) {
      throw new Errors.Forbidden(Errors.messages.tokenExpired)
    }

    const hashedPassword = await Bun.password.hash(password)

    const userUpdated = await DB.updateUser(user.email, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
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
    } = userUpdated

    return c.json(userWithoutCreds)
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
      env.cookieSecret!,
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
        env.cookieSecret!,
        cookieOptions,
      )
    }

    const accessToken = await signAccessToken(payload.uuid, timestamp)

    return c.json({ accessToken })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
