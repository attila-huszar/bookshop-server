import { type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { log } from '@/libs'
import { BaseError } from './BaseError'

export function errorHandler(c: Context, error: unknown) {
  const request = {
    url: c.req.url,
    path: c.req.path,
    method: c.req.method,
    headers: c.req.header(),
    ip:
      c.req.header('X-Forwarded-For') ?? c.req.header('X-Real-Ip') ?? 'unknown',
  }

  if (error instanceof HTTPException) {
    void log.warn(error.constructor.name, { error, request })
    return c.json({ error: error.message }, error.status)
  }

  if (error instanceof BaseError) {
    void log.warn(error.constructor.name, { error, request })
    return c.json({ error: error.message }, error.status)
  }

  if (error instanceof z.ZodError) {
    void log.warn(error.constructor.name, { error, request })
    return c.json({ validation: z.flattenError(error) }, 400)
  }

  if (error instanceof Error) {
    void log.error(error.constructor.name, { error, request })
    return c.json({ error: 'Internal server error' }, 500)
  }

  void log.error('Unknown error', { error: String(error), request })
  return c.json({ error: 'Internal server error' }, 500)
}
