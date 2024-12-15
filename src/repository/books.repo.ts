import { count, eq, max, min } from 'drizzle-orm'
import { books, authors } from './repoHandler'
import { buildBookQueryConditions } from '../utils'
import { db } from '../db'
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
} = books

export async function getBooks(query: BookQuery | undefined): Promise<{
  booksRecords: BookResponse[]
  booksCount: string
}> {
  const page = Math.min(Math.max(1, Number(query?.page) || 1), 100)
  const limit = Math.min(Math.max(1, Number(query?.limit) || 8), 32)
  const offset = (page - 1) * limit

  const conditions = query ? buildBookQueryConditions(query) : undefined

  const [total] = await db
    .select({ count: count() })
    .from(books)
    .where(conditions)

  const booksCount = total.count.toString()

  const booksRecords = await db
    .select({
      id,
      title,
      author: authors.name,
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
    .from(books)
    .leftJoin(authors, eq(authorId, authors.id))
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
      author: authors.name,
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
    .from(books)
    .leftJoin(authors, eq(authorId, authors.id))
    .where(eq(books.id, bookId))
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
    .from(books)

  const genresResult = await db.selectDistinct({ genre }).from(books)

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
