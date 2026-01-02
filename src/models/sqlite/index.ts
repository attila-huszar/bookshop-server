import { booksTable, type BookSQL } from './booksTable'
import { authorsTable, type AuthorSQL } from './authorsTable'
import { usersTable } from './usersTable'
import { newsTable, type NewsSQL } from './newsTable'
import { ordersTable } from './ordersTable'

export {
  booksTable,
  authorsTable,
  usersTable,
  newsTable,
  ordersTable,
  type BookSQL,
  type AuthorSQL,
  type NewsSQL,
}

/**
 * Utility type to convert SQLite string timestamps to Date for MongoDB.
 * SQLite stores timestamps as ISO strings, while MongoDB uses native Date objects.
 */
export type WithDateTimestamps<T> = Omit<T, 'createdAt' | 'updatedAt'> & {
  createdAt: Date
  updatedAt: Date
}
