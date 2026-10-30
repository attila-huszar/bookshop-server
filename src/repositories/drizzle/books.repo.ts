import { count, eq, getTableColumns, inArray, max, min, sql } from 'drizzle-orm'
import { sqlite } from '@/db'
import { authorsTable, booksTable } from '@/models/sqlite'
import { PAGINATION } from '@/constants'
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

export async function getImageUrls(): Promise<string[]> {
  const records = await sqlite.select({ imgUrl }).from(booksTable)

  return records.map((record) => record.imgUrl)
}

export async function getBooks(query?: BookQuery): Promise<{
  booksRecords: BookWithAuthor[]
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
  const conditions = bookQueryBuilder(query)

  const [total] = await sqlite
    .select({ count: count() })
    .from(booksTable)
    .where(conditions)

  if (!total) {
    throw new Error('Failed to get book count')
  }

  const booksCount = total.count.toString()

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

  return { booksRecords, booksCount }
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
    price: [minMaxField.minPrice ?? 0, minMaxField.maxPrice ?? 500],
    publishYear: [
      minMaxField.minYear ?? 1000,
      minMaxField.maxYear ?? new Date().getFullYear(),
    ],
    genre: genres,
  }
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

/** Sample real rows: catalogue IDs may have gaps after CMS deletions. */
export async function getRecommendedBooks(): Promise<BookWithAuthor[]> {
  return await sqlite
    .select({ ...getTableColumns(booksTable), author: authorsTable.name })
    .from(booksTable)
    .leftJoin(authorsTable, eq(authorId, authorsTable.id))
    .orderBy(sql`random()`)
    .limit(4)
}
