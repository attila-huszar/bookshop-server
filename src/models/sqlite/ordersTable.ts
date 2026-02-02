import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  OrderItem,
  PaymentIntentShipping,
  PaymentIntentStatus,
} from '@/types'
import { timestamps } from './column.helpers'

export const ordersTable = sqliteTable('orders', {
  id: int().primaryKey({ autoIncrement: true }),
  paymentId: text('payment_id').unique().notNull(),
  paymentStatus: text('payment_status')
    .$type<PaymentIntentStatus>()
    .default('processing')
    .notNull(),
  total: real().notNull(),
  currency: text().notNull(),
  items: text({ mode: 'json' }).$type<OrderItem[]>().notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  email: text().notNull(),
  shipping: text({ mode: 'json' }).$type<PaymentIntentShipping>().notNull(),
  ...timestamps,
})
