import { Hono } from 'hono'
import { getSignedCookie, setSignedCookie, setCookie } from 'hono/cookie'
import { signAccessToken, signRefreshToken, verifyJWTRefresh } from '../utils'
import { env, cookieOptions } from '../config'

export const auth = new Hono()

auth.post('/refresh', async (c) => {
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

    const expTimestamp = payload.exp ?? 0
    const timestamp = Math.floor(Date.now() / 1000)

    if (expTimestamp - 259200 < timestamp) {
      const refreshToken = await signRefreshToken(payload.uuid, timestamp)
      await setSignedCookie(
        c,
        'refresh-token',
        refreshToken,
        env.cookieSecret,
        cookieOptions,
      )

      const { httpOnly, path, ...loginCookieOptions } = cookieOptions
      setCookie(c, 'uuid', payload.uuid, loginCookieOptions)
    }

    const accessToken = await signAccessToken(payload.uuid, timestamp)

    return c.json({ accessToken })
  } catch (error) {
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})
