import { eq, gte, lte, and, inArray, like } from 'drizzle-orm'
import { books } from '../repository'
import type { BookQuery } from '../types'

export function buildBookQueryConditions(query: BookQuery) {
  const {
    title,
    authorId,
    genre,
    discount,
    discountPrice,
    publishYear,
    rating,
    newRelease,
    topSellers,
  } = books
  const conditions = []

  if (Array.isArray(query.genre)) {
    conditions.push(inArray(genre, query.genre))
  }
  if (query.discount) {
    conditions.push(eq(discount, parseFloat(query.discount)))
  }
  if (query.discountPrice) {
    conditions.push(eq(discountPrice, parseFloat(query.discountPrice)))
  }
  if (query.publishYear) {
    conditions.push(eq(publishYear, parseInt(query.publishYear, 10)))
  }
  if (query.rating) {
    conditions.push(eq(rating, parseFloat(query.rating)))
  }

  if (query.discount_gte) {
    conditions.push(gte(discount, parseFloat(query.discount_gte)))
  }
  if (query.discount_lte) {
    conditions.push(lte(discount, parseFloat(query.discount_lte)))
  }
  if (query.discountPrice_gte) {
    conditions.push(gte(discountPrice, parseFloat(query.discountPrice_gte)))
  }
  if (query.discountPrice_lte) {
    conditions.push(lte(discountPrice, parseFloat(query.discountPrice_lte)))
  }
  if (query.publishYear_gte) {
    conditions.push(gte(publishYear, parseInt(query.publishYear_gte, 10)))
  }
  if (query.publishYear_lte) {
    conditions.push(lte(publishYear, parseInt(query.publishYear_lte, 10)))
  }
  if (query.rating_gte) {
    conditions.push(gte(rating, parseFloat(query.rating_gte)))
  }

  if (query.newRelease) {
    conditions.push(eq(newRelease, true))
  }
  if (query.topSellers) {
    conditions.push(eq(topSellers, true))
  }

  if (query.title) {
    conditions.push(like(title, `%${query.title}%`))
  }

  if (query.authorId) {
    conditions.push(eq(authorId, query.authorId))
  }

  return and(...conditions)
}
