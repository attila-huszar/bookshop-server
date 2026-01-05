import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { Stripe } from 'stripe'
import { timestamps } from './column.helpers'
import { UserRole } from '@/types'

export const usersTable = sqliteTable('users', {
  id: int().primaryKey({ autoIncrement: true }),
  uuid: text().unique().notNull(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  role: text().$type<UserRole>().default(UserRole.User).notNull(),
  email: text().unique().notNull(),
  password: text().notNull(),
  address: text({ mode: 'json' }).$type<Stripe.Address>().notNull(),
  phone: text().notNull(),
  country: text().notNull(),
  avatar: text().notNull(),
  verified: int({ mode: 'boolean' }).$type<boolean>().notNull(),
  verificationToken: text('verification_token').notNull(),
  verificationExpires: text('verification_expires').notNull(),
  passwordResetToken: text('password_reset_token').notNull(),
  passwordResetExpires: text('password_reset_expires').notNull(),
  ...timestamps,
})
