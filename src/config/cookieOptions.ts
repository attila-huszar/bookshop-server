import { cookieMaxAge } from './envConfig'

export const REFRESH_TOKEN = 'refresh_token'

export const cookieOptions: CookieOptions = {
  maxAge: Number(cookieMaxAge) || 1209600,
  httpOnly: true,
  secure: Bun.env.NODE_ENV === 'production',
  sameSite: Bun.env.NODE_ENV === 'production' ? 'none' : 'lax',
  path:
    Bun.env.NODE_ENV === 'production' ? '/users/refresh' : '/api/users/refresh',
}

type CookieOptions = {
  maxAge: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
}
