import { booksTable } from '../repositories'

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

export type BookResponse =
  | (Omit<typeof booksTable.$inferSelect, 'authorId'> & {
      author: string | null
    })
  | undefined
