import { count, eq, inArray, max, min } from 'drizzle-orm'
import { db } from '@/db'
import model from '@/models'
import { queryBuilder } from '@/utils'
import { PAGINATION } from '@/constants'
import type {
  Book,
  BookInsert,
  BookQuery,
  BookUpdate,
  BookWithAuthor,
} from '@/types'

const { booksTable, authorsTable } = model as SQLiteModel

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

  if (!total) {
    throw new Error('Failed to get book count')
  }

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

export async function getBookById(
  bookId: number,
): Promise<BookWithAuthor | null> {
  const [book] = await db
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
  const bookRecords = await db.select().from(booksTable)
  return bookRecords
}

export async function insertBook(book: BookInsert): Promise<Book> {
  const [newBook] = await db.insert(booksTable).values(book).returning()
  if (!newBook) {
    throw new Error('Failed to create book')
  }
  return newBook
}

export async function updateBook(
  bookId: number,
  book: BookUpdate,
): Promise<Book> {
  const [updatedBook] = await db
    .update(booksTable)
    .set(book)
    .where(eq(booksTable.id, bookId))
    .returning()
  if (!updatedBook) {
    throw new Error('Book not found')
  }
  return updatedBook
}

export async function deleteBooks(bookIds: number[]): Promise<Book['id'][]> {
  await db.delete(booksTable).where(inArray(booksTable.id, bookIds))
  return bookIds
}
