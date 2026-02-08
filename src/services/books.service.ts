import { booksDB } from '@/repositories'
import { idSchema, validate } from '@/validation'
import { stripTimestamps } from '@/utils'
import type { BookQuery, BookWithAuthor } from '@/types'

export async function getBooks(query?: BookQuery): Promise<{
  booksRecords: WithoutTS<BookWithAuthor>[]
  booksCount: string
}> {
  const result = await booksDB.getBooks(query)
  return {
    booksRecords: result.booksRecords.map(stripTimestamps),
    booksCount: result.booksCount,
  }
}

export async function getBookById(
  id: number,
): Promise<WithoutTS<BookWithAuthor> | null> {
  const validatedId = validate(idSchema, id)
  const book = await booksDB.getBookById(validatedId)
  return book ? stripTimestamps(book) : null
}
