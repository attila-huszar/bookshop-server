type BookRangeKeys<T extends string> = `${T}_gte` | `${T}_lte`

type BookBaseQuery = {
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
