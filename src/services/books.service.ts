import { booksDB } from '@/repositories'
import { idSchema, validate } from '@/validation'
import { publicBookResponse } from '@/utils/response.utils'
import type { BookQuery } from '@/types'

export async function getBooks(query?: BookQuery): Promise<{
  booksRecords: ReturnType<typeof publicBookResponse>[]
  booksCount: string
}> {
  const result = await booksDB.getBooks(query)

  return {
    booksRecords: result.booksRecords.map(publicBookResponse),
    booksCount: result.booksCount,
  }
}

export async function getBookById(
  id: number,
): Promise<ReturnType<typeof publicBookResponse> | null> {
  const validatedId = validate(idSchema, id)
  const book = await booksDB.getBookById(validatedId)

  return book ? publicBookResponse(book) : null
}

export async function getRecommendedBooks(): Promise<
  ReturnType<typeof publicBookResponse>[]
> {
  return (await booksDB.getRecommendedBooks()).map(publicBookResponse)
}
