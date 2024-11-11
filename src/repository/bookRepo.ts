import { eq } from 'drizzle-orm'
import { db } from '../db'
import { authorsTable, booksTable } from '../db/schema'
import { buildBookQueryConditions } from '../utils'
import type { BookQuery, BookResponse } from '../types'

export async function getBooks(query: BookQuery | undefined): Promise<{
  books: BookResponse[]
  booksCount: string
}> {
  const page = Math.min(Math.max(1, Number(query?.page) || 1), 100)
  const limit = Math.min(Math.max(1, Number(query?.limit) || 8), 32)
  const offset = (page - 1) * limit

  const booksCount = String(await db.$count(booksTable))
  const conditions = query ? buildBookQueryConditions(query) : undefined

  const books = await db
    .select({
      id: booksTable.id,
      title: booksTable.title,
      author: authorsTable.name,
      genre: booksTable.genre,
      imgUrl: booksTable.imgUrl,
      description: booksTable.description,
      publishYear: booksTable.publishYear,
      rating: booksTable.rating,
      price: booksTable.price,
      discount: booksTable.discount,
      discountPrice: booksTable.discountPrice,
      topSellers: booksTable.topSellers,
      newRelease: booksTable.newRelease,
      createdAt: booksTable.createdAt,
      updatedAt: booksTable.updatedAt,
    })
    .from(booksTable)
    .leftJoin(authorsTable, eq(booksTable.authorId, authorsTable.id))
    .where(conditions)
    .limit(limit)
    .offset(offset)

  return { books, booksCount }
}

export async function getBookById(id: number): Promise<BookResponse> {
  const bookRecord = (
    await db
      .select({
        id: booksTable.id,
        title: booksTable.title,
        author: authorsTable.name,
        genre: booksTable.genre,
        imgUrl: booksTable.imgUrl,
        description: booksTable.description,
        publishYear: booksTable.publishYear,
        rating: booksTable.rating,
        price: booksTable.price,
        discount: booksTable.discount,
        discountPrice: booksTable.discountPrice,
        topSellers: booksTable.topSellers,
        newRelease: booksTable.newRelease,
        createdAt: booksTable.createdAt,
        updatedAt: booksTable.updatedAt,
      })
      .from(booksTable)
      .leftJoin(authorsTable, eq(booksTable.authorId, authorsTable.id))
      .where(eq(booksTable.id, id))
  )[0]

  return bookRecord
}
