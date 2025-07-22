import {
  createSelectSchema,
  createInsertSchema,
  createUpdateSchema,
} from 'drizzle-zod'
import { booksTable } from '@/repositories'

export const bookSchema = createSelectSchema(booksTable)
export const bookCreateSchema = createInsertSchema(booksTable)
export const bookUpdateSchema = createUpdateSchema(booksTable)
