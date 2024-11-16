import * as Errors from '.'
import type { Context } from 'hono'

export function errorHandler(c: Context, error: unknown) {
  if (error instanceof Errors.BaseError) {
    return c.json({ error: error.message }, error.status)
  }

  return c.json({ error: 'Internal server error' }, 500)
}
