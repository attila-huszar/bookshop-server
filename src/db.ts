import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import * as schema from './db/schema'

const sqlite = new Database('db.sqlite')
export const db = drizzle({ client: sqlite, schema })
