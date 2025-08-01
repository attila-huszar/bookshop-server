import { count, eq, inArray, max, min } from 'drizzle-orm'
import { booksTable, authorsTable } from './repoHandler'
import { db } from '@/db'
import { queryBuilder } from '@/utils'
import { PAGINATION } from '@/constants'
import type {
  Book,
  BookQuery,
  BookCreate,
  BookUpdate,
  BookWithAuthor,
} from '@/types'

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

export async function getBookById(bookId: number): Promise<BookWithAuthor> {
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

export async function getAllBooks(): Promise<Book[]> {
  const bookRecords = await db.select().from(booksTable)
  return bookRecords
}

export async function insertBook(book: BookCreate): Promise<Book> {
  const [newBook] = await db.insert(booksTable).values(book).returning()
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
  return updatedBook
}

export async function deleteBooks(bookIds: number[]): Promise<Book[]> {
  const deletedBooks = await db
    .delete(booksTable)
    .where(inArray(booksTable.id, bookIds))
    .returning()
  return deletedBooks
}
