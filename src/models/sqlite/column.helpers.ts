import { sql } from 'drizzle-orm'
import { integer } from 'drizzle-orm/sqlite-core'

export const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull()
    .$type<Date>(),

  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .default(sql`(unixepoch())`)
    .notNull()
    .$type<Date>(),
}
