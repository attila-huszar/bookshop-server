import {
  count,
  eq,
  getTableColumns,
  inArray,
  max,
  min,
  or,
  sql,
} from 'drizzle-orm'
import { sqlite } from '@/database/sqlite'
import { authorsTable, booksTable } from '@/models/sqlite'
import { catalogueFilterDefaults } from '@/constants/catalogue'
import { PAGINATION } from '@/constants/pagination'
import type {
  Book,
  BookInsert,
  BookQuery,
  BookUpdate,
  BookWithAuthor,
} from '@/types'
import { bookQueryBuilder } from './books.query'

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
  booksRecords: BookWithAuthor[]
  booksCount: number
}> {
  const page = Math.min(Math.max(1, query?.page ?? 1), PAGINATION.MAX_PAGE)
  const limit = Math.min(
    Math.max(1, query?.limit ?? PAGINATION.DEFAULT_LIMIT),
    PAGINATION.MAX_LIMIT,
  )
  const offset = (page - 1) * limit
  const conditions = bookQueryBuilder(query)

  const [total] = await sqlite
    .select({ count: count() })
    .from(booksTable)
    .where(conditions)

  if (!total) {
    throw new Error('Failed to get book count')
  }

  const booksRecords = await sqlite
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

  return { booksRecords, booksCount: total.count }
}

export async function getBookById(
  bookId: number,
): Promise<BookWithAuthor | null> {
  const [book] = await sqlite
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

  return book ?? null
}

export async function getAllBooks(): Promise<Book[]> {
  const bookRecords = await sqlite.select().from(booksTable)

  return bookRecords
}

export async function insertBook(book: BookInsert): Promise<Book> {
  const [newBook] = await sqlite.insert(booksTable).values(book).returning()

  if (!newBook) {
    throw new Error('Failed to create book')
  }

  return newBook
}

export async function updateBook(
  bookId: number,
  book: BookUpdate,
): Promise<Book | null> {
  const [updatedBook] = await sqlite
    .update(booksTable)
    .set(book)
    .where(eq(booksTable.id, bookId))
    .returning()

  return updatedBook ?? null
}

export async function hardDeleteBooks(
  bookIds: number[],
): Promise<Book['id'][]> {
  await sqlite.delete(booksTable).where(inArray(booksTable.id, bookIds))

  return bookIds
}

export async function getBookSearchOptions(): Promise<{
  genre: string[]
  price: [number, number]
  publishYear: [number, number]
}> {
  const minMaxFields = await sqlite
    .select({
      minPrice: min(discountPrice),
      maxPrice: max(discountPrice),
      minYear: min(publishYear),
      maxYear: max(publishYear),
    })
    .from(booksTable)

  const genresResult = await sqlite.selectDistinct({ genre }).from(booksTable)

  const genres = genresResult
    .map((row) => row.genre)
    .filter((genre) => genre !== null)

  const minMaxField = minMaxFields[0]

  if (!minMaxField) {
    throw new Error('Failed to get min/max values')
  }

  return {
    price: [
      minMaxField.minPrice ?? 0,
      minMaxField.maxPrice ?? catalogueFilterDefaults.maxPrice,
    ],
    publishYear: [
      minMaxField.minYear ?? catalogueFilterDefaults.minYear,
      minMaxField.maxYear ?? new Date().getFullYear(),
    ],
    genre: genres,
  }
}

export async function getRecommendedBooks(): Promise<BookWithAuthor[]> {
  return await sqlite
    .select({ ...getTableColumns(booksTable), author: authorsTable.name })
    .from(booksTable)
    .leftJoin(authorsTable, eq(authorId, authorsTable.id))
    .orderBy(sql`random()`)
    .limit(4)
}

export async function getImageUrls(): Promise<string[]> {
  const records = await sqlite.select({ imgUrl }).from(booksTable)

  return records.map((record) => record.imgUrl)
}

export async function searchBooks(
  search: string,
  limit: number,
): Promise<BookWithAuthor[]> {
  const pattern = `%${search.replace(/[\\%_]/g, '\\$&')}%`
  const titleMatches = sql`${title} LIKE ${pattern} ESCAPE ${'\\'}`
  const authorMatches = sql`${authorsTable.name} LIKE ${pattern} ESCAPE ${'\\'}`

  return sqlite
    .select({ ...getTableColumns(booksTable), author: authorsTable.name })
    .from(booksTable)
    .leftJoin(authorsTable, eq(authorId, authorsTable.id))
    .where(or(titleMatches, authorMatches))
    .orderBy(sql`CASE WHEN ${titleMatches} THEN 0 ELSE 1 END`, id)
    .limit(limit)
}
