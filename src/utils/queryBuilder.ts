import { eq, gte, lte, and, inArray, like } from 'drizzle-orm'
import { booksTable as c } from '@/models/sqlite'
import type { BookQuery } from '@/types'

export function queryBuilder(q?: BookQuery) {
  if (!q) return undefined

  const conditions = [
    Array.isArray(q.genre) && q.genre.length > 0 && inArray(c.genre, q.genre),
    q.discount && eq(c.discount, parseFloat(q.discount)),
    q.discountPrice && eq(c.discountPrice, parseFloat(q.discountPrice)),
    q.publishYear && eq(c.publishYear, parseInt(q.publishYear, 10)),
    q.rating && eq(c.rating, parseFloat(q.rating)),
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
