import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { booksTable } from '@/models/sqlite'

export const bookSelectSchema = createSelectSchema(booksTable)
export const bookInsertSchema = createInsertSchema(booksTable)
export const bookUpdateSchema = createUpdateSchema(booksTable)
