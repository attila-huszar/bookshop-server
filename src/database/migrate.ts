import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { sqlite } from '@/db'

migrate(sqlite, { migrationsFolder: './src/database/migrations' })

console.info('Database migrated \u2705')
process.exit(0)
