import { index, int, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { EmailDeliveryStatus } from '@/types/outbox.types'
import type { SendEmailProps } from '@/types/worker.types'

export const emailOutboxTable = sqliteTable(
  'email_outbox',
  {
    id: text().primaryKey(),
    payload: text({ mode: 'json' }).$type<SendEmailProps>().notNull(),
    availableAt: int('available_at', { mode: 'timestamp_ms' }).notNull(),
    attempts: int().notNull().default(0),
    leaseToken: text('lease_token'),
    lockedUntil: int('locked_until', { mode: 'timestamp_ms' }),
    processedAt: int('processed_at', { mode: 'timestamp_ms' }),
    lastError: text('last_error'),
    deliveryStatus: text('delivery_status').$type<EmailDeliveryStatus>(),
    deliveryAttempts: int('delivery_attempts').notNull().default(0),
    deliveryUpdatedAt: int('delivery_updated_at', { mode: 'timestamp_ms' }),
    deliveryNextAttemptAt: int('delivery_next_attempt_at', {
      mode: 'timestamp_ms',
    }),
    deliveryError: text('delivery_error'),
    createdAt: int('created_at', { mode: 'timestamp_ms' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index('email_outbox_pending_idx').on(table.processedAt, table.availableAt),
  ],
)
