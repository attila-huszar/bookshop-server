import { and, eq, gte, inArray, like, lte } from 'drizzle-orm'
import { booksTable as c } from '@/models/sqlite'
import type { BookQuery } from '@/types'

export function bookQueryBuilder(q?: BookQuery) {
  if (!q) return

  const comparisons = [
    [c.discount, q.discount, eq],
    [c.discountPrice, q.discountPrice, eq],
    [c.publishYear, q.publishYear, eq],
    [c.rating, q.rating, eq],
    [c.discount, q.discount_gte, gte],
    [c.discount, q.discount_lte, lte],
    [c.discountPrice, q.discountPrice_gte, gte],
    [c.discountPrice, q.discountPrice_lte, lte],
    [c.publishYear, q.publishYear_gte, gte],
    [c.publishYear, q.publishYear_lte, lte],
    [c.rating, q.rating_gte, gte],
    [c.rating, q.rating_lte, lte],
    [c.newRelease, q.newRelease, eq],
    [c.topSellers, q.topSellers, eq],
    [c.authorId, q.authorId, eq],
  ] as const

  const conditions = [
    ...comparisons.flatMap(([column, value, compare]) =>
      value === undefined ? [] : [compare(column, value)],
    ),
    Array.isArray(q.genre) && q.genre.length > 0 && inArray(c.genre, q.genre),
    q.title && like(c.title, `%${q.title}%`),
  ].filter((condition) => typeof condition === 'object' && condition !== null)

  return and(...conditions)
}
