import { int, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  OrderItem,
  PaymentIntentShipping,
  PaymentIntentStatus,
} from '@/types'
import { timestamps } from './column.helpers'

export const ordersTable = sqliteTable('orders', {
  id: int().primaryKey({ autoIncrement: true }),
  paymentId: text('payment_id').unique(),
  checkoutRequestId: text('checkout_request_id').notNull().unique(),
  paymentStatus: text('payment_status')
    .$type<PaymentIntentStatus>()
    .default('processing')
    .notNull(),
  lastStripeEventCreated: int('last_stripe_event_created').$type<number>(),
  lastStripeEventId: text('last_stripe_event_id'),
  lastReconciliationAttemptAt: int('last_reconciliation_attempt_at', {
    mode: 'timestamp_ms',
  }).$type<Date>(),
  lastReconciledAt: int('last_reconciled_at', {
    mode: 'timestamp_ms',
  }).$type<Date>(),
  reconciliationFailures: int('reconciliation_failures').notNull().default(0),
  reconciliationAlertId: text('reconciliation_alert_id'),
  paidAt: int('paid_at', { mode: 'timestamp' }).$type<Date>(),
  total: real().notNull(),
  currency: text().notNull(),
  items: text({ mode: 'json' }).$type<OrderItem[]>().notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  email: text(),
  shipping: text({ mode: 'json' }).$type<PaymentIntentShipping>(),
  deletedAt: int('deleted_at', { mode: 'timestamp_ms' }).$type<Date>(),
  ...timestamps,
})
