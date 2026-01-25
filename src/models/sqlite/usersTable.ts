import { int, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Stripe } from 'stripe'
import { UserRole } from '@/types'
import { timestamps } from './column.helpers'

export const usersTable = sqliteTable('users', {
  id: int().primaryKey({ autoIncrement: true }),
  uuid: text().unique().notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text().default(UserRole.User).notNull().$type<UserRole>(),
  email: text().unique().notNull(),
  password: text().notNull(),
  address: text({ mode: 'json' }).$type<Stripe.Address>(),
  phone: text(),
  country: text().notNull(),
  avatar: text(),
  verified: int({ mode: 'boolean' }).notNull().$type<boolean>(),
  verificationToken: text('verification_token'),
  verificationExpires: integer('verification_expires', {
    mode: 'timestamp',
  }).$type<Date>(),
  passwordResetToken: text('password_reset_token'),
  passwordResetExpires: integer('password_reset_expires', {
    mode: 'timestamp',
  }).$type<Date>(),
  ...timestamps,
})
