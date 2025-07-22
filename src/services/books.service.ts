import { booksDB } from '@/repositories'
import type { BookQuery } from '@/types'

export async function getBooks(query?: BookQuery) {
  return booksDB.getBooks(query)
}

export async function getBookById(id: number) {
  return booksDB.getBookById(id)
}
