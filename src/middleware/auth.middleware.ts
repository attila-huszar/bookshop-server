import { type MiddlewareHandler } from 'hono'
import { jwt } from 'hono/jwt'
import { env } from '@/config'
import { getActiveUser } from '@/services'
import type { AuthVariables } from '@/types'

export const authMiddleware: MiddlewareHandler<{
  Variables: AuthVariables
}> = async (c, next) => {
  return await jwt({ secret: env.jwtAccessSecret!, alg: 'HS256' })(
    c,
    async () => {
      const payload = c.get('jwtPayload')
      c.set('authUser', await getActiveUser(payload.uuid))

      await next()
    },
  )
}
