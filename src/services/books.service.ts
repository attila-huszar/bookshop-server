import { booksDB } from '@/repositories'
import { idSchema, validate } from '@/validation'
import { publicBookResponse } from '@/utils/response.utils'
import type { BookQuery } from '@/types'

export async function getBooks(query?: BookQuery): Promise<{
  booksRecords: ReturnType<typeof publicBookResponse>[]
  booksCount: number
}> {
  if (query?.recommended) {
    const recommendedBooks = await booksDB.getRecommendedBooks()

    return {
      booksRecords: recommendedBooks.map(publicBookResponse),
      booksCount: recommendedBooks.length,
    }
  }

  const books = await booksDB.getBooks(query)

  return {
    booksRecords: books.booksRecords.map(publicBookResponse),
    booksCount: books.booksCount,
  }
}

export async function getBookById(
  id: number,
): Promise<ReturnType<typeof publicBookResponse> | null> {
  const validatedId = validate(idSchema, id)
  const book = await booksDB.getBookById(validatedId)

  return book ? publicBookResponse(book) : null
}

export async function searchBooks(search: string) {
  return (await booksDB.searchBooks(search, 10)).map(publicBookResponse)
}
