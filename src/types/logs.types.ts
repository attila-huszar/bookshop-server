import type { z } from 'zod'
import { logSchema } from '@/validation'

export type LogEntry = z.infer<typeof logSchema>
