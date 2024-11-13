import { verify } from 'hono/jwt'
import { jwtAccessSecret, jwtRefreshSecret } from '../config/envConfig'

export const verifyJWTAccess = (token: string) => {
  if (!jwtAccessSecret) throw new Error('JWT access secret not set')

  try {
    return verify(token, jwtAccessSecret)
  } catch (error) {
    throw new Error('Invalid access token', { cause: error })
  }
}

export const verifyJWTRefresh = (token: string) => {
  if (!jwtRefreshSecret) throw new Error('JWT refresh secret not set')

  try {
    return verify(token, jwtRefreshSecret)
  } catch (error) {
    throw new Error('Invalid refresh token', { cause: error })
  }
}
