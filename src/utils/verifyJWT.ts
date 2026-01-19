import { verify } from 'hono/jwt'
import { env } from '@/config'

export const verifyJWTAccess = (token: string) => {
  try {
    return verify(token, env.jwtAccessSecret!, { alg: 'HS256' })
  } catch (error) {
    throw new Error('Invalid access token', { cause: error })
  }
}

export const verifyJWTRefresh = (token: string) => {
  try {
    return verify(token, env.jwtRefreshSecret!, { alg: 'HS256' })
  } catch (error) {
    throw new Error('Invalid refresh token', { cause: error })
  }
}
