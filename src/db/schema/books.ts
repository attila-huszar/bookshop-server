import { sqliteTable, int, text, real } from 'drizzle-orm/sqlite-core'
import { timestamps } from '../column.helpers'

export const booksTable = sqliteTable('books', {
  id: int().primaryKey({ autoIncrement: true }),
  title: text().notNull(),
  author: int().notNull(),
  genre: text(),
  imgUrl: text('img_url'),
  description: text(),
  publishYear: int('publish_year'),
  rating: real(),
  price: real().notNull(),
  discount: real().default(0),
  discountPrice: real('discount_price').notNull(),
  topSellers: int('top_sellers', { mode: 'boolean' }).default(false),
  newRelease: int('new_release', { mode: 'boolean' }).default(false),
  ...timestamps,
})
