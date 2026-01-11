import { and, eq, gte, inArray, like, lte } from 'drizzle-orm'
import { booksTable as c } from '@/models/sqlite'
import type { BookQuery } from '@/types'

export function queryBuilder(q?: BookQuery) {
  if (!q) return

  const conditions = [
    Array.isArray(q.genre) && q.genre.length > 0 && inArray(c.genre, q.genre),
    q.discount && eq(c.discount, parseFloat(q.discount)),
    q.discountPrice && eq(c.discountPrice, parseFloat(q.discountPrice)),
    q.publishYear && eq(c.publishYear, parseInt(q.publishYear, 10)),
    q.discount_gte && gte(c.discount, parseFloat(q.discount_gte)),
    q.discount_lte && lte(c.discount, parseFloat(q.discount_lte)),
    q.discountPrice_gte &&
      gte(c.discountPrice, parseFloat(q.discountPrice_gte)),
    q.discountPrice_lte &&
      lte(c.discountPrice, parseFloat(q.discountPrice_lte)),
    q.publishYear_gte && gte(c.publishYear, parseInt(q.publishYear_gte, 10)),
    q.publishYear_lte && lte(c.publishYear, parseInt(q.publishYear_lte, 10)),
    q.rating_gte && gte(c.rating, parseFloat(q.rating_gte)),
    q.newRelease && eq(c.newRelease, true),
    q.topSellers && eq(c.topSellers, true),
    q.title && like(c.title, `%${q.title}%`),
    q.authorId && eq(c.authorId, q.authorId),
  ].filter((cond) => typeof cond === 'object' && cond !== null)

  return and(...conditions)
}

export function mongoQueryBuilder(
  q?: BookQuery,
): Record<string, unknown> | undefined {
  if (!q) return

  const filter: Record<string, unknown> = {}

  const addFilter = (key: string, value: unknown) => {
    if (value !== undefined && value !== null) {
      filter[key] = value
    }
  }

  const addRangeFilter = (
    key: string,
    gteValue?: string,
    lteValue?: string,
    parser: (val: string) => number = parseFloat,
  ) => {
    const rangeFilter: Record<string, number> = {}
    if (gteValue) rangeFilter.$gte = parser(gteValue)
    if (lteValue) rangeFilter.$lte = parser(lteValue)
    if (Object.keys(rangeFilter).length > 0) {
      filter[key] = rangeFilter
    }
  }

  if (Array.isArray(q.genre) && q.genre.length > 0) {
    addFilter('genre', { $in: q.genre })
  }

  addFilter('discount', q.discount ? parseFloat(q.discount) : undefined)
  addFilter(
    'discountPrice',
    q.discountPrice ? parseFloat(q.discountPrice) : undefined,
  )
  addFilter(
    'publishYear',
    q.publishYear ? parseInt(q.publishYear, 10) : undefined,
  )
  addFilter('newRelease', q.newRelease ? true : undefined)
  addFilter('topSellers', q.topSellers ? true : undefined)

  if (q.title) {
    addFilter('title', { $regex: q.title, $options: 'i' })
  }

  addRangeFilter('discount', q.discount_gte, q.discount_lte)
  addRangeFilter('discountPrice', q.discountPrice_gte, q.discountPrice_lte)
  addRangeFilter('publishYear', q.publishYear_gte, q.publishYear_lte, (val) =>
    parseInt(val, 10),
  )
  addRangeFilter('rating', q.rating_gte, undefined)

  return filter
}
