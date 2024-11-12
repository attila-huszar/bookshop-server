import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './column.helpers'

export const usersTable = sqliteTable('users', {
  id: int().primaryKey({ autoIncrement: true }),
  uuid: text()
    .notNull()
    .unique()
    .$defaultFn(() => crypto.randomUUID()),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text({ enum: ['admin', 'user'] })
    .notNull()
    .default('user'),
  email: text().notNull().unique(),
  password: text().notNull(),
  address: text({ mode: 'json' }),
  phone: text(),
  avatar: text(),
  verified: int({ mode: 'boolean' }).notNull().default(false),
  verificationCode: text('verification_code'),
  verificationExpires: text('verification_expires'),
  passwordResetCode: text('password_reset_code'),
  passwordResetExpires: text('password_reset_expires'),
  ...timestamps,
})
