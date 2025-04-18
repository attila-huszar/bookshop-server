import { type Context } from 'hono'
import { type ContentfulStatusCode } from 'hono/utils/http-status'
import { ZodError } from 'zod'
import { logger } from '../services'
import { commonMessage } from '../constants'
import { BaseError } from './BaseError'

export function errorHandler(c: Context, error: unknown) {
  const request = {
    path: c.req.path,
    method: c.req.method,
    ip:
      c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown',
  }

  if (error instanceof BaseError) {
    void logger.warn(error.name, { error, request })

    return c.json(
      { error: error.message },
      error.status as ContentfulStatusCode,
    )
  } else if (error instanceof ZodError) {
    void logger.error('Validation error', { error, request })

    return c.json({ error: commonMessage.fieldsRequired }, 400)
  } else if (error instanceof Error) {
    void logger.error(error.name, { error, request })
  } else {
    void logger.error('Unknown error type', {
      error: String(error),
      request,
    })
  }

  return c.json({ error: 'Internal server error' }, 500)
}
