import { sign } from 'hono/jwt'
import { env } from '../config'

export const signAccessToken = async (uuid: string, timestamp: number) => {
  const accessToken = await sign(
    {
      uuid,
      exp: timestamp + Number(env.jwtAccessExpiration),
      iat: timestamp,
    },
    env.jwtAccessSecret!,
  )

  return accessToken
}

export const signRefreshToken = async (uuid: string, timestamp: number) => {
  const refreshToken = await sign(
    {
      uuid,
      exp: timestamp + Number(env.jwtRefreshExpiration),
      iat: timestamp,
    },
    env.jwtRefreshSecret!,
  )

  return refreshToken
}
