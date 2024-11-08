import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

const sqlite = new Database('data/db.sqlite')
export const db = drizzle({ client: sqlite, casing: 'snake_case' })
