import type { z } from 'zod'
import type { logSchema } from '@/validation'

export type LogEntry = z.infer<typeof logSchema>
