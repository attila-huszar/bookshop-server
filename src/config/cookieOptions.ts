import { env } from './env'

export const REFRESH_TOKEN = 'refresh_token'

export const cookieOptions: CookieOptions = {
  maxAge: Number(env.cookieMaxAge) || 1209600,
  httpOnly: true,
  secure: Bun.env.NODE_ENV === 'prod',
  sameSite: Bun.env.NODE_ENV === 'prod' ? 'none' : 'lax',
  path: Bun.env.NODE_ENV === 'prod' ? '/users' : '/api/users',
}

type CookieOptions = {
  maxAge: number
  httpOnly: boolean
  secure: boolean
  sameSite: 'lax' | 'strict' | 'none'
  path: string
}
