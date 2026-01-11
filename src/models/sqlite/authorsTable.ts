import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './column.helpers'

export const authorsTable = sqliteTable('authors', {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  fullName: text('full_name').notNull(),
  birthYear: text('birth_year').notNull(),
  deathYear: text('death_year').notNull(),
  homeland: text().notNull(),
  biography: text().notNull(),
  ...timestamps,
})
