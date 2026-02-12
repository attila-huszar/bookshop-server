import type { MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import { env } from '@/config'
import { log } from '@/libs'

const BEARER_PREFIX = 'Bearer '

export const optionalAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('authorization')

  if (authHeader?.startsWith(BEARER_PREFIX)) {
    const token = authHeader.substring(BEARER_PREFIX.length)

    try {
      const payload = await verify(token, env.jwtAccessSecret!, 'HS256')
      if (payload.uuid) {
        c.set('jwtPayload', { uuid: payload.uuid })
      }

      log.info('Checkout initiated by registered user', { uuid: payload.uuid })
    } catch {
      log.info(
        'Checkout initiated by guest user (no or invalid token provided)',
      )
    }
  }

  await next()
}
