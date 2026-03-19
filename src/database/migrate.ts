import { migrate } from 'drizzle-orm/bun-sqlite/migrator'
import { sqlite } from '@/db'
import { MIGRATIONS_DIR } from '@/constants'

try {
  migrate(sqlite, { migrationsFolder: MIGRATIONS_DIR })
  console.info('Database migrated ✅')
  process.exit(0)
} catch (error) {
  console.error('❌ Database migration failed:', error)
  process.exit(1)
}
