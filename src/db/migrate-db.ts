import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { db } from './sqlite'

migrate(db, { migrationsFolder: './src/db/migrations' })

console.info('Database migrated \u2705')
