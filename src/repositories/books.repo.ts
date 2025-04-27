import { count, eq, max, min } from 'drizzle-orm'
import { booksTable, authorsTable } from './repoHandler'
import { db } from '../db'
import { queryBuilder } from '../utils'
import { PAGINATION } from '../constants'
import type { BookQuery, BookResponse } from '../types'

const {
  id,
  title,
  authorId,
  genre,
  imgUrl,
  description,
  publishYear,
  rating,
  price,
  discount,
  discountPrice,
  topSellers,
  newRelease,
  createdAt,
  updatedAt,
} = booksTable

export async function getBooks(query?: BookQuery): Promise<{
  booksRecords: BookResponse[]
  booksCount: string
}> {
  const page = Math.min(
    Math.max(1, Number(query?.page) || 1),
    PAGINATION.MAX_PAGE,
  )
  const limit = Math.min(
    Math.max(1, Number(query?.limit) || PAGINATION.DEFAULT_LIMIT),
    PAGINATION.MAX_LIMIT,
  )
  const offset = (page - 1) * limit
  const conditions = queryBuilder(query)

  const [total] = await db
    .select({ count: count() })
    .from(booksTable)
    .where(conditions)

  const booksCount = total.count.toString()

  const booksRecords = await db
    .select({
      id,
      title,
      author: authorsTable.name,
      genre,
      imgUrl,
      description,
      publishYear,
      rating,
      price,
      discount,
      discountPrice,
      topSellers,
      newRelease,
      createdAt,
      updatedAt,
    })
    .from(booksTable)
    .leftJoin(authorsTable, eq(authorId, authorsTable.id))
    .where(conditions)
    .limit(limit)
    .offset(offset)

  return { booksRecords, booksCount }
}

export async function getBookById(bookId: number): Promise<BookResponse> {
  const bookRecords = await db
    .select({
      id,
      title,
      author: authorsTable.name,
      genre,
      imgUrl,
      description,
      publishYear,
      rating,
      price,
      discount,
      discountPrice,
      topSellers,
      newRelease,
      createdAt,
      updatedAt,
    })
    .from(booksTable)
    .leftJoin(authorsTable, eq(authorId, authorsTable.id))
    .where(eq(booksTable.id, bookId))
    .limit(1)

  return bookRecords[0]
}

export async function getBookSearchOptions(): Promise<{
  genre: string[]
  price: [number, number]
  publishYear: [number, number]
}> {
  const minMaxFields = await db
    .select({
      minPrice: min(discountPrice),
      maxPrice: max(discountPrice),
      minYear: min(publishYear),
      maxYear: max(publishYear),
    })
    .from(booksTable)

  const genresResult = await db.selectDistinct({ genre }).from(booksTable)

  const genres = genresResult
    .map((row) => row.genre)
    .filter((genre) => genre !== null)

  return {
    price: [minMaxFields[0].minPrice ?? 0, minMaxFields[0].maxPrice ?? 500],
    publishYear: [
      minMaxFields[0].minYear ?? 1000,
      minMaxFields[0].maxYear ?? new Date().getFullYear(),
    ],
    genre: genres,
  }
}
