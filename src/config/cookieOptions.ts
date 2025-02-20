import { cookieMaxAge } from './envConfig'

export const REFRESH_TOKEN = "refresh_token"

export const cookieOptions: CookieOptions = {
  maxAge: Number(cookieMaxAge) || 1209600,
  httpOnly: true,
  secure: Bun.env.NODE_ENV === 'production',
  sameSite: 'none',
  path: '/users/refresh',
}

type CookieOptions = {
  maxAge: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
}
