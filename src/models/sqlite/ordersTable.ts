import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import {
  type OrderItem,
  OrderStatus,
  type StripeShipping,
  type StripeStatus,
} from '@/types'
import { timestamps } from './column.helpers'

export const ordersTable = sqliteTable('orders', {
  id: int().primaryKey({ autoIncrement: true }),
  paymentId: text('payment_id').unique().notNull(),
  paymentIntentStatus: text('payment_intent_status')
    .$type<StripeStatus>()
    .default('processing')
    .notNull(),
  orderStatus: text('order_status')
    .$type<OrderStatus>()
    .default(OrderStatus.Pending)
    .notNull(),
  total: real().notNull(),
  currency: text().notNull(),
  items: text({ mode: 'json' }).$type<OrderItem[]>().notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text().notNull(),
  shipping: text({ mode: 'json' }).$type<StripeShipping>().notNull(),
  ...timestamps,
})
