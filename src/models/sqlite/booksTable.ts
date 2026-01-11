import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { authorsTable } from './authorsTable'
import { timestamps } from './column.helpers'

export const booksTable = sqliteTable('books', {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  authorId: int('author_id')
    .references(() => authorsTable.id)
    .notNull(),
  genre: text().notNull(),
  imgUrl: text('img_url').notNull(),
  description: text().notNull(),
  publishYear: int('publish_year').notNull(),
  rating: real().notNull(),
  price: real().notNull(),
  discount: real().notNull(),
  discountPrice: real('discount_price').notNull(),
  topSellers: int('top_sellers', { mode: 'boolean' })
    .$type<boolean>()
    .notNull(),
  newRelease: int('new_release', { mode: 'boolean' })
    .$type<boolean>()
    .notNull(),
  ...timestamps,
})
