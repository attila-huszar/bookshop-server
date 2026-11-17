import type { MiddlewareHandler } from 'hono'
import { env } from '@/config/env'
import { Forbidden } from '@/errors/Forbidden'

export const googleSignInMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.header('origin') !== env.clientBaseUrl) {
    throw new Forbidden(
      'Google sign-in requires the configured frontend origin',
    )
  }

  c.header('Cache-Control', 'no-store')
  await next()
}
