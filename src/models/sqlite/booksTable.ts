import { sqliteTable, int, text, real } from 'drizzle-orm/sqlite-core'
import { timestamps } from './column.helpers'
import { authorsTable } from './authorsTable'

export const booksTable = sqliteTable('books', {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  authorId: int('author_id').references(() => authorsTable.id),
  genre: text(),
  imgUrl: text('img_url'),
  description: text(),
  publishYear: int('publish_year'),
  rating: real(),
  price: real().notNull(),
  discount: real().notNull().default(0),
  discountPrice: real('discount_price').notNull(),
  topSellers: int('top_sellers', { mode: 'boolean' }).notNull().default(false),
  newRelease: int('new_release', { mode: 'boolean' }).notNull().default(false),
  ...timestamps,
})

export type BookSQL = typeof booksTable.$inferSelect
