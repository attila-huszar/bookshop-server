import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

let sqlite

try {
  sqlite = new Database('data/db.sqlite')
  console.log('SQLite connected successfully.')
} catch (error) {
  console.error('Failed to connect to SQLite:', error)
  process.exit(1)
}

export const db = drizzle({ client: sqlite, casing: 'snake_case' })
