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
  verificationToken: text('verification_token'),
  verificationExpires: text('verification_expires'),
  passwordResetToken: text('password_reset_token'),
  passwordResetExpires: text('password_reset_expires'),
  ...timestamps,
})
