import * as Sentry from '@sentry/bun'
import * as Errors from './'
import type { Context } from 'hono'

export function errorHandler(c: Context, error: unknown) {
  Sentry.captureException(error)

  if (error instanceof Error) {
    const stackLines = error.stack?.split('\n')
    const firstTwoLines = stackLines?.slice(0, 2).join('\n')
    console.error(firstTwoLines)
  } else {
    console.error(error)
  }

  if (error instanceof Errors.BaseError) {
    return c.json({ error: error.message }, error.status)
  }

  return c.json({ error: 'Internal server error' }, 500)
}
