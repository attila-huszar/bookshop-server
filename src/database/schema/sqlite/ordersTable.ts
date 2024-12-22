import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Stripe } from 'stripe'
import { timestamps } from './column.helpers'
import { OrderStatus } from '../../../types'

export const ordersTable = sqliteTable('orders', {
  id: int().primaryKey({ autoIncrement: true }),
  paymentId: text().unique().notNull(),
  paymentIntentStatus: text()
    .$type<Stripe.PaymentIntent.Status>()
    .default('processing')
    .notNull(),
  orderStatus: text()
    .$type<OrderStatus>()
    .default(OrderStatus.Pending)
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
