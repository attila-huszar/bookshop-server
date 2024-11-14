import { verify } from 'hono/jwt'
import { env } from '../config'

export const verifyJWTAccess = (token: string) => {
  if (!env.jwtAccessSecret) throw new Error('JWT access secret not set')

  try {
    return verify(token, env.jwtAccessSecret)
  } catch (error) {
    throw new Error('Invalid access token', { cause: error })
  }
}

export const verifyJWTRefresh = (token: string) => {
  if (!env.jwtRefreshSecret) throw new Error('JWT refresh secret not set')

  try {
    return verify(token, env.jwtRefreshSecret)
  } catch (error) {
    throw new Error('Invalid refresh token', { cause: error })
  }
}
