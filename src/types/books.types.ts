import type { z } from 'zod'
import type {
  bookInsertSchema,
  bookQuerySchema,
  bookSelectSchema,
  bookUpdateSchema,
} from '@/validation'

export type Book = z.infer<typeof bookSelectSchema>
export type BookInsert = z.infer<typeof bookInsertSchema>
export type BookUpdate = z.infer<typeof bookUpdateSchema>

export type BookWithAuthor = Omit<Book, 'authorId'> & {
  author: string | null
}

export type BookQuery = z.infer<typeof bookQuerySchema>
