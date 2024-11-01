import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const usersTable = sqliteTable('users', {
  id: int().primaryKey({ autoIncrement: true }),
  name: text().notNull(),
  role: text({ enum: ['admin', 'user'] })
    .notNull()
    .default('user'),
  email: text().notNull().unique(),
})
