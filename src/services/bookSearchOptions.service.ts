import { booksDB } from '../repositories'

export async function getBookSearchOptions() {
  return booksDB.getBookSearchOptions()
}
