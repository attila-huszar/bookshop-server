import { Hono } from 'hono'
import { decode } from 'hono/jwt'
import { getSignedCookie } from 'hono/cookie'
import {
  jwtAccessSecret,
  jwtRefreshSecret,
  jwtAccessExpiration,
  jwtRefreshExpiration,
  cookieSecret,
} from '../config/envConfig'
import { signRefreshToken } from '../utils'
import { signAccessToken } from '../utils/signJWT'
import type { JWTPayload } from 'hono/utils/jwt/types'

export const auth = new Hono().basePath('/auth')

auth.post('/refresh', async (c) => {
  const jwtPayload: JWTPayload = c.get('jwtPayload')

  if (!cookieSecret) throw new Error('Cookie secret not set')
  if (!jwtAccessSecret || !jwtAccessExpiration)
    throw new Error('JWT access secret not set')
  if (!jwtRefreshSecret || !jwtRefreshExpiration)
    throw new Error('JWT refresh secret not set')

  try {
    const currentRefreshToken = await getSignedCookie(
      c,
      cookieSecret,
      'refresh-token',
    )

    if (!currentRefreshToken) {
      return c.json({ error: 'No refresh token provided' }, 401)
    }

    const { payload } = decode(currentRefreshToken)

    console.log('payload', payload)
    const expTimestamp = payload.exp ?? 0
    const timestamp = Math.floor(Date.now() / 1000)

    if (expTimestamp - 259200 < timestamp) {
      signRefreshToken(c, payload.uuid, timestamp)
    }

    const accessToken = await signAccessToken(c, payload.uuid, timestamp)

    return c.json({ accessToken })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})
