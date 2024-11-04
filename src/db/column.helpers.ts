import { text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

export const timestamps = {
  created_at: text()
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updated_at: text(),
}
