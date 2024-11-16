import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './column.helpers'

export const ordersTable = sqliteTable('orders', {
  id: int().primaryKey({ autoIncrement: true }),
  paymentId: text().unique().notNull(),
  status: text({ enum: ['pending', 'paid', 'cancelled'] })
    .default('pending')
    .notNull(),
  total: real().notNull(),
  currency: text().notNull(),
  items: text({ mode: 'json' }).notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text().notNull(),
  phone: text(),
  address: text({ mode: 'json' }).notNull(),
  ...timestamps,
})
