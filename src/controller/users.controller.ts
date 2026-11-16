import { Hono } from 'hono'
import { env } from '@/config/env'
import {
  loginWithGoogle,
  requireGoogleAuth,
} from '@/services/googleAuth.service'
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
import {
  clearGoogleAuthCookie,
  clearPaymentCookie,
  clearRefreshCookie,
  getGoogleAuthCookie,
  getRefreshCookie,
  setGoogleAuthCookie,
  setRefreshCookie,
} from '@/utils/cookie.utils'
import {
  signAccessToken,
  signRefreshToken,
  verifyJWTRefresh,
} from '@/utils/jwt.utils'
import { isJsonRequest } from '@/utils/request.utils'
import { publicUserResponse } from '@/utils/response.utils'
import { authTiming } from '@/constants/auth'
import { API, COUNTRY_CODES_FILE } from '@/constants/paths'
import { Forbidden, Unauthorized } from '@/errors'
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
import { AuthErrorCode } from '@/types/enums'

export const users = new Hono<{ Variables: AuthVariables }>()

// These JSON endpoints are called by our frontend, never posted to by Google.
users.use(`${API.users.google}/*`, async (c, next) => {
  const isTrustedOrigin = c.req.header('origin') === env.clientBaseUrl

  if (!isTrustedOrigin) {
    throw new Forbidden(
      'Google sign-in requires the configured frontend origin',
    )
  }

  c.header('Cache-Control', 'no-store')
  await next()
})

users.post(API.users.googleNonce, async (c) => {
  requireGoogleAuth()

  const sessionId = crypto.randomUUID()
  const nonce = Bun.CSRF.generate(env.cookieSecret, {
    sessionId,
    expiresIn: authTiming.googleNonceMs,
  })
  await setGoogleAuthCookie(c, sessionId)

  return c.json({ nonce })
})

users.post(API.users.google, async (c) => {
  if (!isJsonRequest(c)) {
    throw new Forbidden('Google sign-in requires a JSON request')
  }

  const sessionId = await getGoogleAuthCookie(c)

  if (!sessionId) {
    throw new Unauthorized(
      'Google sign-in challenge expired',
      AuthErrorCode.InvalidToken,
    )
  }

  const { accessToken, refreshToken, firstName } = await loginWithGoogle(
    await c.req.json<unknown>(),
    sessionId,
  )
  clearGoogleAuthCookie(c)
  await setRefreshCookie(c, refreshToken)

  return c.json({ accessToken, firstName })
})

users.post(API.users.login, async (c) => {
  const loginRequest = await c.req.json<LoginRequest>()
  const { accessToken, refreshToken, firstName } = await loginUser(loginRequest)

  await setRefreshCookie(c, refreshToken)

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
  await passwordResetRequest(request)

  return c.json({ success: true })
})

users.post(API.users.passwordResetToken, async (c) => {
  const request = await c.req.json<PasswordResetToken>()
  const { token } = await passwordResetToken(request)

  return c.json({ token })
})

users.post(API.users.passwordResetSubmit, async (c) => {
  const request = await c.req.json<PasswordResetSubmit>()
  await passwordResetSubmit(request)

  return c.json({ success: true })
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
  clearRefreshCookie(c)
  clearPaymentCookie(c)

  return c.json({ success: true })
})

users.post(API.users.refresh, async (c) => {
  const refreshTokenCookie = await getRefreshCookie(c)

  if (!refreshTokenCookie) {
    return c.json({ accessToken: null }, 200)
  }

  let jwtPayload: AuthJWTPayload

  try {
    jwtPayload = await verifyJWTRefresh(refreshTokenCookie)
  } catch {
    clearRefreshCookie(c)

    return c.json({ accessToken: null }, 200)
  }

  const user = await getActiveUser(jwtPayload.uuid, { optional: true })

  if (!user) {
    clearRefreshCookie(c)

    return c.json({ accessToken: null }, 200)
  }

  const expTimestamp = jwtPayload.exp ?? 0
  const timestamp = Math.floor(Date.now() / 1000)
  const shouldRenewRefreshToken =
    expTimestamp - authTiming.refreshRenewalSeconds < timestamp

  if (shouldRenewRefreshToken) {
    const refreshToken = await signRefreshToken(jwtPayload.uuid, timestamp)

    await setRefreshCookie(c, refreshToken)
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
  const file = Bun.file(COUNTRY_CODES_FILE)
  const content: unknown = await file.json()

  return c.json(content)
})
