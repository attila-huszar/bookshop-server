import type { z } from 'zod'
import { logSchema } from '@/validation'

export type Log = z.infer<typeof logSchema>
