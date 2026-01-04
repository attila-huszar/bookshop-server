import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './column.helpers'
import {
  type OrderItem,
  OrderStatus,
  type PaymentIntentShipping,
  type PaymentIntentStatus,
} from '@/types'

export const ordersTable = sqliteTable('orders', {
  id: int().primaryKey({ autoIncrement: true }),
  paymentId: text('payment_id').unique().notNull(),
  paymentIntentStatus: text('payment_intent_status')
    .$type<PaymentIntentStatus>()
    .default('processing')
    .notNull(),
  orderStatus: text('order_status')
    .$type<OrderStatus>()
    .default(OrderStatus.Pending)
    .notNull(),
  total: real().notNull(),
  currency: text().notNull(),
  items: text({ mode: 'json' }).$type<OrderItem[]>().notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text(),
  shipping: text({ mode: 'json' }).$type<PaymentIntentShipping>(),
  ...timestamps,
})
