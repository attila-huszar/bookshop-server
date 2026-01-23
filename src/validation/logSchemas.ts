import { z } from 'zod'

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error'])

export const logSchema = z.object({
  level: LogLevel,
  message: z.string('Message is required'),
  meta: z.record(z.string(), z.unknown()).optional(),
})
