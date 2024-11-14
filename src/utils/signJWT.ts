import { sign } from 'hono/jwt'
import { env } from '../config'

export const signAccessToken = async (uuid: string, timestamp: number) => {
  if (!env.jwtAccessSecret || !env.jwtAccessExpiration)
    throw new Error('JWT access secret not set')

  const accessToken = await sign(
    {
      uuid,
      exp: timestamp + Number(env.jwtAccessExpiration),
      iat: timestamp,
    },
    env.jwtAccessSecret,
  )

  return accessToken
}

export const signRefreshToken = async (uuid: string, timestamp: number) => {
  if (!env.jwtRefreshSecret || !env.jwtRefreshExpiration)
    throw new Error('JWT refresh secret not set')

  const refreshToken = await sign(
    {
      uuid,
      exp: timestamp + Number(env.jwtRefreshExpiration),
      iat: timestamp,
    },
    env.jwtRefreshSecret,
  )

  return refreshToken
}
