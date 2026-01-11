import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import { cookieOptions, env, REFRESH_TOKEN } from '@/config'
import {
  getUserProfile,
  loginUser,
  passwordResetRequest,
  passwordResetSubmit,
  passwordResetToken,
  registerUser,
  updateUserProfile,
  uploadUserAvatar,
  verifyUser,
} from '@/services'
import { signAccessToken, signRefreshToken, verifyJWTRefresh } from '@/utils'
import { errorHandler } from '@/errors'
import type {
  LoginRequest,
  PasswordResetRequest,
  PasswordResetSubmit,
  PasswordResetToken,
  UserUpdate,
  VerificationRequest,
} from '@/types'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const users = new Hono<{ Variables: Variables }>()

users.post('/login', async (c) => {
  try {
    const loginRequest = await c.req.json<LoginRequest>()
    const { accessToken, refreshToken, firstName } =
      await loginUser(loginRequest)

    await setSignedCookie(
      c,
      REFRESH_TOKEN,
      refreshToken,
      env.cookieSecret!,
      cookieOptions,
    )

    return c.json({ accessToken, firstName })
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.post('/register', async (c) => {
  try {
    const registerRequest = await c.req.formData()
    const { email } = await registerUser(registerRequest)

    return c.json({ email })
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.post('/verification', async (c) => {
  try {
    const verificationRequest = await c.req.json<VerificationRequest>()
    const { email } = await verifyUser(verificationRequest)

    return c.json({ email })
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.post('/password-reset-request', async (c) => {
  try {
    const request = await c.req.json<PasswordResetRequest>()
    const { message } = await passwordResetRequest(request)

    return c.json({ message })
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.post('/password-reset-token', async (c) => {
  try {
    const request = await c.req.json<PasswordResetToken>()
    const { token } = await passwordResetToken(request)

    return c.json({ token })
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.post('/password-reset-submit', async (c) => {
  try {
    const request = await c.req.json<PasswordResetSubmit>()
    const { message } = await passwordResetSubmit(request)

    return c.json({ message })
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.get('/profile', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')
    const user = await getUserProfile(jwtPayload.uuid)

    return c.json(user)
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.patch('/profile', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')
    const updateFields = await c.req.json<UserUpdate>()
    const user = await updateUserProfile(jwtPayload.uuid, updateFields)

    return c.json(user)
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.post('/logout', (c) => {
  try {
    deleteCookie(c, REFRESH_TOKEN, cookieOptions)

    return c.json({ success: true })
  } catch (error) {
    return errorHandler(c, error)
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
      return c.json({ accessToken: null }, 200)
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
    return errorHandler(c, error)
  }
})

users.post('/avatar', async (c) => {
  try {
    const jwtPayload = c.get('jwtPayload')
    const formData = await c.req.formData()
    const avatar = formData.get('avatar')

    const user = await uploadUserAvatar(jwtPayload.uuid, avatar)

    return c.json(user)
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.get('/country', (c) => {
  try {
    const country = c.req.header('cf-ipcountry')?.toLowerCase()
    return c.json({ country })
  } catch (error) {
    return errorHandler(c, error)
  }
})

users.get('/country-codes', async (c) => {
  try {
    const file = Bun.file('./src/resources/country-codes.json')
    const content: unknown = await file.json()
    return c.json(content)
  } catch (error) {
    return errorHandler(c, error)
  }
})
