import { sign } from 'hono/jwt'
import { setSignedCookie, setCookie } from 'hono/cookie'
import { cookieOptions } from '../config/cookieOptions'
import {
  jwtAccessExpiration,
  jwtAccessSecret,
  jwtRefreshExpiration,
  jwtRefreshSecret,
  cookieSecret,
} from '../config/envConfig'
import type { Context } from 'hono'

export const signAccessToken = async (
  c: Context,
  uuid: string,
  timestamp: number,
) => {
  if (!jwtAccessSecret || !jwtAccessExpiration)
    throw new Error('JWT access secret not set')

  const accessToken = await sign(
    {
      uuid,
      exp: timestamp + Number(jwtAccessExpiration),
      iat: timestamp,
    },
    jwtAccessSecret,
  )

  return accessToken
}
export const signRefreshToken = async (
  c: Context,
  uuid: string,
  timestamp: number,
) => {
  if (!jwtRefreshSecret || !jwtRefreshExpiration)
    throw new Error('JWT refresh secret not set')
  if (!cookieSecret) throw new Error('Cookie secret not set')

  const refreshToken = await sign(
    {
      uuid,
      exp: timestamp + Number(jwtRefreshExpiration),
      iat: timestamp,
    },
    jwtRefreshSecret,
  )

  setSignedCookie(c, 'refresh-token', refreshToken, cookieSecret, cookieOptions)

  const { httpOnly, signed, path, ...loginCookieOptions } = cookieOptions

  setCookie(c, 'uuid', uuid, loginCookieOptions)
}
