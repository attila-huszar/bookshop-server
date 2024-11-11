import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { db } from '../db'

migrate(db, { migrationsFolder: './src/database/migrations' })

console.info('Database migrated \u2705')
