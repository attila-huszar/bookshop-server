import type { MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import { env } from '@/config'
import { getActiveUser } from '@/services'
import { log } from '@/libs'
import type { AuthVariables } from '@/types'

const BEARER_PREFIX = 'Bearer '

export const optionalAuthMiddleware: MiddlewareHandler<{
  Variables: Partial<AuthVariables>
}> = async (c, next) => {
  const authHeader = c.req.header('authorization')

  if (authHeader?.startsWith(BEARER_PREFIX)) {
    const token = authHeader.substring(BEARER_PREFIX.length)
    let uuid: string | undefined

    try {
      const payload = await verify(token, env.jwtAccessSecret!, 'HS256')

      if (typeof payload.uuid === 'string') {
        uuid = payload.uuid
      }
    } catch {
      log.info(
        'Checkout initiated by guest user (no or invalid token provided)',
      )
    }

    if (uuid) {
      const user = await getActiveUser(uuid, { optional: true })

      if (user) {
        c.set('authUser', user)
        log.info('Checkout initiated by registered user', { uuid })
      }
    }
  }

  await next()
}
