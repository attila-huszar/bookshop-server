import type { z } from 'zod'
import type {
  bookInsertSchema,
  bookSelectSchema,
  bookUpdateSchema,
} from '@/validation'

export type Book = z.infer<typeof bookSelectSchema>
export type BookInsert = z.infer<typeof bookInsertSchema>
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
