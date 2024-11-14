import { Hono } from 'hono'
import { getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie'
import { env, cookieOptions } from '../config'
import { signAccessToken, signRefreshToken, verifyJWTRefresh } from '../utils'

export const auth = new Hono().basePath('/auth')

auth.post('/refresh', async (c) => {
  //const jwtPayload = c.get('jwtPayload')

  if (!env.cookieSecret) throw new Error('Cookie secret not set')
  if (!env.jwtAccessSecret || !env.jwtAccessExpiration)
    throw new Error('JWT access secret not set')
  if (!env.jwtRefreshSecret || !env.jwtRefreshExpiration)
    throw new Error('JWT refresh secret not set')

  try {
    const refreshTokenCookie = await getSignedCookie(
      c,
      env.cookieSecret,
      'refresh-token',
    )

    if (!refreshTokenCookie) {
      return c.json({ error: 'No refresh token provided' }, 401)
    }

    const payload = (await verifyJWTRefresh(refreshTokenCookie)) as {
      uuid: string
      exp: number
      iat: number
    }

    console.log('payload', payload)
    const expTimestamp = payload.exp ?? 0
    const timestamp = Math.floor(Date.now() / 1000)

    if (expTimestamp - 259200 < timestamp) {
      if (!env.cookieSecret) throw new Error('Cookie secret not set')

      const refreshToken = await signRefreshToken(payload.uuid, timestamp)
      setSignedCookie(
        c,
        'refresh-token',
        refreshToken,
        env.cookieSecret,
        cookieOptions,
      )

      const { httpOnly, signed, path, ...loginCookieOptions } = cookieOptions
      setCookie(c, 'uuid', payload.uuid, loginCookieOptions)
    }

    const accessToken = await signAccessToken(payload.uuid, timestamp)

    return c.json({ accessToken })
  } catch (error) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})
