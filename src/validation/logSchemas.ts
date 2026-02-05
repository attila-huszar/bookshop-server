import { z } from 'zod'

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error'])

export const logSchema = z.object({
  level: LogLevel,
  message: z.string().min(1, 'Message cannot be empty'),
  meta: z.unknown().optional(),
})
