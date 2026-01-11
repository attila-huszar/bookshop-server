import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { authorsTable } from '@/models/sqlite'

export const authorSelectSchema = createSelectSchema(authorsTable)
export const authorInsertSchema = createInsertSchema(authorsTable)
export const authorUpdateSchema = createUpdateSchema(authorsTable)
