import { Hono } from 'hono'
import { logSchema, validate } from '@/validation'
import { log } from '@/libs'
import type { Log } from '@/types'

export const logs = new Hono()

logs.post('/', async (c) => {
  try {
    const body = await c.req.json<Log>()
    const validatedBody = validate(logSchema, body)
    const { level, message, meta } = validatedBody

    switch (level) {
      case 'debug':
        log.debug(`[FRONTEND] ${message}`, meta)
        break
      case 'warn':
        log.warning(`[FRONTEND] ${message}`, meta)
        break
      case 'error':
        log.error(`[FRONTEND] ${message}`, meta)
        break
      default:
        log.info(`[FRONTEND] ${message}`, meta)
    }

    return c.status(201)
  } catch {
    return c.status(201)
  }
})
