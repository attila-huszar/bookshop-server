import { authTiming } from '@/constants/auth'
import { API } from '@/constants/paths'
import { TimeMs } from '@/constants/time'
import { env } from './env'

export const REFRESH_TOKEN = 'refresh_token'
export const PAYMENT_SESSION = 'payment_session'
export const GOOGLE_AUTH_SESSION = 'google_auth_session'

export const cookieOptions: CookieOptions = {
  maxAge: Number(env.cookieMaxAge) || authTiming.cookieMaxAgeSeconds,
  httpOnly: true,
  secure: Bun.env.NODE_ENV === 'production',
  sameSite: Bun.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: `${API.api}${API.users.refresh}`,
}

export const paymentCookieOptions: CookieOptions = {
  maxAge: authTiming.paymentSessionSeconds,
  httpOnly: true,
  secure: Bun.env.NODE_ENV === 'production',
  sameSite: Bun.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path: `${API.api}${API.payments.root}`,
}

export const googleCookieOptions: CookieOptions = {
  ...cookieOptions,
  maxAge: authTiming.googleNonceMs / TimeMs.OneSecond,
  path: `${API.api}${API.users.google}`,
}

type CookieOptions = {
  maxAge: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
}
