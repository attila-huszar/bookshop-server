import { z } from 'zod'
import type {
  bookSchema,
  bookCreateSchema,
  bookUpdateSchema,
} from '@/validation'
import type { booksTable } from '@/models/sqlite'

export type BookInsert = typeof booksTable.$inferInsert

export type Book = z.infer<typeof bookSchema>
export type BookCreate = z.infer<typeof bookCreateSchema>
export type BookUpdate = z.infer<typeof bookUpdateSchema>

export type BookWithAuthor = Omit<Book, 'authorId'> & {
  author: string | null
}

type BookRangeKeys<T extends string> = `${T}_gte` | `${T}_lte`

type BookBaseQuery = {
  id?: string
  page?: string
  limit?: string
  genre?: string | string[]
  discountPrice?: string
  discount?: string
  publishYear?: string
  rating?: string
  newRelease?: boolean
  topSellers?: boolean
  title?: string
  authorId?: number
}

type RangeAllowedKeys = 'discountPrice' | 'discount' | 'publishYear' | 'rating'

export type BookQuery = BookBaseQuery & {
  [K in RangeAllowedKeys as BookRangeKeys<K>]?: string
}
