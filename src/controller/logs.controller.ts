import { Hono } from 'hono'
import { logSchema, validate } from '@/validation'
import { frontendLog } from '@/libs'
import { API } from '@/constants'
import type { LogEntry } from '@/types'

export const logs = new Hono()

logs.post(API.logs.root, async (c) => {
  try {
    const body = await c.req.json<LogEntry>()
    const validatedBody = validate(logSchema, body)
    const { level, message, meta } = validatedBody

    switch (level) {
      case 'debug':
        frontendLog.debug(`[FRONTEND] ${message}`, meta)
        break
      case 'warn':
        frontendLog.warn(`[FRONTEND] ${message}`, meta)
        break
      case 'error':
        frontendLog.error(`[FRONTEND] ${message}`, meta)
        break
      default:
        frontendLog.info(`[FRONTEND] ${message}`, meta)
    }

    return c.text('Created', 201)
  } catch {
    return c.text('Created', 201)
  }
})
