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

export function mongoQueryBuilder(q?: BookQuery): Record<string, unknown> {
  if (!q) return {}

  const filter: Record<string, unknown> = {}

  if (Array.isArray(q.genre) && q.genre.length > 0) {
    filter.genre = { $in: q.genre }
  }
  if (q.discount) {
    filter.discount = parseFloat(q.discount)
  }
  if (q.discountPrice) {
    filter.discountPrice = parseFloat(q.discountPrice)
  }
  if (q.publishYear) {
    filter.publishYear = parseInt(q.publishYear, 10)
  }
  if (q.rating) {
    filter.rating = parseFloat(q.rating)
  }
  if (q.discount_gte || q.discount_lte) {
    const discountFilter: Record<string, number> = {}
    if (q.discount_gte) discountFilter.$gte = parseFloat(q.discount_gte)
    if (q.discount_lte) discountFilter.$lte = parseFloat(q.discount_lte)
    filter.discount = discountFilter
  }
  if (q.discountPrice_gte || q.discountPrice_lte) {
    const discountPriceFilter: Record<string, number> = {}
    if (q.discountPrice_gte) {
      discountPriceFilter.$gte = parseFloat(q.discountPrice_gte)
    }
    if (q.discountPrice_lte) {
      discountPriceFilter.$lte = parseFloat(q.discountPrice_lte)
    }
    filter.discountPrice = discountPriceFilter
  }
  if (q.publishYear_gte || q.publishYear_lte) {
    const publishYearFilter: Record<string, number> = {}
    if (q.publishYear_gte) {
      publishYearFilter.$gte = parseInt(q.publishYear_gte, 10)
    }
    if (q.publishYear_lte) {
      publishYearFilter.$lte = parseInt(q.publishYear_lte, 10)
    }
    filter.publishYear = publishYearFilter
  }
  if (q.rating_gte) {
    filter.rating = { $gte: parseFloat(q.rating_gte) }
  }
  if (q.newRelease) {
    filter.newRelease = true
  }
  if (q.topSellers) {
    filter.topSellers = true
  }
  if (q.title) {
    filter.title = { $regex: q.title, $options: 'i' }
  }
  if (q.authorId) {
    filter.authorId = q.authorId
  }

  return filter
}
