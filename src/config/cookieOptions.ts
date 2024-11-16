import { cookieMaxAge } from './envConfig'

export const cookieOptions: CookieOptions = {
  maxAge: Number(cookieMaxAge) || 1209600,
  httpOnly: true,
  secure: Bun.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/auth/refresh',
}

type CookieOptions = {
  maxAge: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
}
