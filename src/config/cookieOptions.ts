import { cookieMaxAge } from './envConfig'

export const cookieOptions: CookieOptions = {
  maxAge: Number(cookieMaxAge) || 1209600,
  httpOnly: true,
  signed: true,
  secure: Bun.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/auth',
}

type CookieOptions = {
  maxAge: number
  httpOnly: boolean
  signed: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
}
