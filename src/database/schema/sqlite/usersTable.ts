import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { timestamps } from './column.helpers'

export const usersTable = sqliteTable('users', {
  id: int().primaryKey({ autoIncrement: true }),
  uuid: text().unique().notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text({ enum: ['admin', 'user'] })
    .default('user')
    .notNull(),
  email: text().unique().notNull(),
  password: text().notNull(),
  address: text({ mode: 'json' }),
  phone: text(),
  avatar: text(),
  verified: int({ mode: 'boolean' }).default(false).notNull(),
  verificationCode: text('verification_code'),
  verificationExpires: text('verification_expires'),
  passwordResetCode: text('password_reset_code'),
  passwordResetExpires: text('password_reset_expires'),
  ...timestamps,
})
