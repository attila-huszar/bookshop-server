import { Hono } from 'hono'
import { deleteCookie, getSignedCookie, setSignedCookie } from 'hono/cookie'
import {
  cookieOptions,
  env,
  PAYMENT_SESSION,
  paymentCookieOptions,
  REFRESH_TOKEN,
} from '@/config'
import {
  getActiveUser,
  loginUser,
  passwordResetRequest,
  passwordResetSubmit,
  passwordResetToken,
  registerUser,
  updateUserProfile,
  uploadUserAvatar,
  verifyUser,
} from '@/services/users.service'
import { signAccessToken, signRefreshToken, verifyJWTRefresh } from '@/utils'
import { publicUserResponse } from '@/utils/response.utils'
import { API } from '@/constants'
import type {
  AuthJWTPayload,
  AuthVariables,
  LoginRequest,
  PasswordResetRequest,
  PasswordResetSubmit,
  PasswordResetToken,
  ProfileUpdate,
  PublicUser,
  VerificationRequest,
} from '@/types'

export const users = new Hono<{ Variables: AuthVariables }>()

users.post(API.users.login, async (c) => {
  const loginRequest = await c.req.json<LoginRequest>()
  const { accessToken, refreshToken, firstName } = await loginUser(loginRequest)

  await setSignedCookie(
    c,
    REFRESH_TOKEN,
    refreshToken,
    env.cookieSecret!,
    cookieOptions,
  )

  return c.json({ accessToken, firstName })
})

users.post(API.users.register, async (c) => {
  const registerRequest = await c.req.formData()
  const { email } = await registerUser(registerRequest)

  return c.json({ email })
})

users.post(API.users.verification, async (c) => {
  const verificationRequest = await c.req.json<VerificationRequest>()
  const { email } = await verifyUser(verificationRequest)

  return c.json({ email })
})

users.post(API.users.passwordResetRequest, async (c) => {
  const request = await c.req.json<PasswordResetRequest>()
  const { message } = await passwordResetRequest(request)

  return c.json({ message })
})

users.post(API.users.passwordResetToken, async (c) => {
  const request = await c.req.json<PasswordResetToken>()
  const { token } = await passwordResetToken(request)

  return c.json({ token })
})

users.post(API.users.passwordResetSubmit, async (c) => {
  const request = await c.req.json<PasswordResetSubmit>()
  const { message } = await passwordResetSubmit(request)

  return c.json({ message })
})

users.get(API.users.profile, (c) => {
  return c.json(publicUserResponse(c.get('authUser')))
})

users.patch(API.users.profile, async (c) => {
  const authUser = c.get('authUser')
  const updateFields = await c.req.json<ProfileUpdate>()
  const user: PublicUser = await updateUserProfile(authUser, updateFields)

  return c.json(user)
})

users.post(API.users.logout, (c) => {
  deleteCookie(c, REFRESH_TOKEN, cookieOptions)
  deleteCookie(c, PAYMENT_SESSION, paymentCookieOptions)

  return c.json({ success: true })
})

users.post(API.users.refresh, async (c) => {
  const refreshTokenCookie = await getSignedCookie(
    c,
    env.cookieSecret!,
    REFRESH_TOKEN,
  )

  if (!refreshTokenCookie) {
    return c.json({ accessToken: null }, 200)
  }

  let jwtPayload: AuthJWTPayload

  try {
    jwtPayload = await verifyJWTRefresh(refreshTokenCookie)
  } catch {
    deleteCookie(c, REFRESH_TOKEN, cookieOptions)

    return c.json({ accessToken: null }, 200)
  }

  const user = await getActiveUser(jwtPayload.uuid, { optional: true })

  if (!user) {
    deleteCookie(c, REFRESH_TOKEN, cookieOptions)

    return c.json({ accessToken: null }, 200)
  }

  const expTimestamp = jwtPayload.exp ?? 0
  const timestamp = Math.floor(Date.now() / 1000)

  if (expTimestamp - 259200 < timestamp) {
    const refreshToken = await signRefreshToken(jwtPayload.uuid, timestamp)

    await setSignedCookie(
      c,
      REFRESH_TOKEN,
      refreshToken,
      env.cookieSecret!,
      cookieOptions,
    )
  }

  const accessToken = await signAccessToken(jwtPayload.uuid, timestamp)

  return c.json({ accessToken })
})

users.post(API.users.avatar, async (c) => {
  const authUser = c.get('authUser')
  const formData = await c.req.formData()
  const avatar = formData.get('avatar')

  const user: PublicUser = await uploadUserAvatar(authUser, avatar)

  return c.json(user)
})

users.get(API.users.country, (c) => {
  const country = c.req.header('cf-ipcountry')?.toLowerCase()

  return c.json({ country })
})

users.get(API.users.countryCodes, async (c) => {
  const file = Bun.file('./src/resources/country-codes.json')
  const content: unknown = await file.json()

  return c.json(content)
})
