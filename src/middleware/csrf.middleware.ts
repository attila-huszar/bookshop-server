import type { MiddlewareHandler } from 'hono'
import { csrf } from 'hono/csrf'
import { env } from '@/config/env'
import { API } from '@/constants/paths'

export function createCsrfMiddleware(): MiddlewareHandler {
  const csrfMiddleware = csrf({ origin: [env.clientBaseUrl!] })

  return async (c, next) => {
    const path = c.req.path

    if (
      path === API.webhooks.root ||
      path.startsWith(`${API.webhooks.root}/`)
    ) {
      return next()
    }

    return csrfMiddleware(c, next)
  }
}
