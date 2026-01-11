import { booksDB } from '@/repositories'
import { idSchema, validate } from '@/validation'
import type { BookQuery } from '@/types'

export async function getBooks(query?: BookQuery) {
  return booksDB.getBooks(query)
}

export async function getBookById(id: number) {
  const validatedId = validate(idSchema, id)
  return booksDB.getBookById(validatedId)
}
