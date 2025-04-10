import { logger } from '../services'
import type { Context } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import * as Errors from './'

export function errorHandler(c: Context, error: unknown) {
  const isDev = Bun.env.NODE_ENV !== 'production'

  const requestInfo = {
    path: c.req.path,
    method: c.req.method,
    ip:
      c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown',
  }

  if (error instanceof Errors.BaseError) {
    void logger.error(error, { request: requestInfo })

    return c.json(
      { error: error.message },
      error.status as ContentfulStatusCode,
    )
  } else if (error instanceof Error) {
    void logger.error(error, { request: requestInfo })

    if (isDev) {
      return c.json(
        {
          error: error.message,
          stack: error.stack,
        },
        500,
      )
    }
  } else {
    void logger.error('Unknown error type', {
      error: String(error),
      request: requestInfo,
    })
  }

  return c.json({ error: 'Internal server error' }, 500)
}
