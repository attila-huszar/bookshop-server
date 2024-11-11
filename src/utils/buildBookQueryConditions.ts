import { eq, gte, lte, and, inArray } from 'drizzle-orm'
import { booksTable } from '../database/schema'
import type { BookQuery } from '../types'

export function buildBookQueryConditions(query: BookQuery) {
  const conditions = []

  if (Array.isArray(query.genre)) {
    conditions.push(inArray(booksTable.genre, query.genre))
  }
  if (query.discount) {
    conditions.push(eq(booksTable.discount, parseFloat(query.discount)))
  }
  if (query.discountPrice) {
    conditions.push(
      eq(booksTable.discountPrice, parseFloat(query.discountPrice)),
    )
  }
  if (query.publishYear) {
    conditions.push(eq(booksTable.publishYear, parseInt(query.publishYear, 10)))
  }
  if (query.rating) {
    conditions.push(eq(booksTable.rating, parseFloat(query.rating)))
  }

  if (query.discount_gte) {
    conditions.push(gte(booksTable.discount, parseFloat(query.discount_gte)))
  }
  if (query.discount_lte) {
    conditions.push(lte(booksTable.discount, parseFloat(query.discount_lte)))
  }
  if (query.discountPrice_gte) {
    conditions.push(
      gte(booksTable.discountPrice, parseFloat(query.discountPrice_gte)),
    )
  }
  if (query.discountPrice_lte) {
    conditions.push(
      lte(booksTable.discountPrice, parseFloat(query.discountPrice_lte)),
    )
  }
  if (query.publishYear_gte) {
    conditions.push(
      gte(booksTable.publishYear, parseInt(query.publishYear_gte, 10)),
    )
  }
  if (query.publishYear_lte) {
    conditions.push(
      lte(booksTable.publishYear, parseInt(query.publishYear_lte, 10)),
    )
  }
  if (query.rating_gte) {
    conditions.push(gte(booksTable.rating, parseFloat(query.rating_gte)))
  }

  return and(...conditions)
}
