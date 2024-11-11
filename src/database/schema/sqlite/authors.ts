import { sqliteTable, int, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './column.helpers'

export const authorsTable = sqliteTable('authors', {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  fullName: text('full_name'),
  birthYear: text('birth_year'),
  deathYear: text('death_year'),
  homeland: text(),
  biography: text(),
  ...timestamps,
})
