import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { authorsTable } from '@/repositories'

export const authorSchema = createSelectSchema(authorsTable)
export const authorCreateSchema = createInsertSchema(authorsTable)
export const authorUpdateSchema = createUpdateSchema(authorsTable)
