import { z } from 'zod'

export const LogLevel = z.enum(['debug', 'info', 'warn', 'error'])

export const logSchema = z.object({
  level: LogLevel,
  message: z.string().nonempty('Message cannot be empty'),
  meta: z.record(z.string(), z.unknown()).optional(),
})
