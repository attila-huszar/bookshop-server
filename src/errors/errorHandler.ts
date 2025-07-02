import { z } from 'zod/v4'
import { type Context } from 'hono'
import { logger } from '../libs'
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
    return c.json({ error: error.message }, error.status)
  }

  if (error instanceof z.ZodError) {
    void logger.error('Validation error', { error, request })
    return c.json({ error: z.flattenError(error) }, 400)
  }

  if (error instanceof Error) {
    void logger.error(error.name, { error, request })
    return c.json({ error: 'Internal server error' }, 500)
  }

  void logger.error('Unknown error', {
    error: String(error),
    request,
  })
  return c.json({ error: 'Internal server error' }, 500)
}
