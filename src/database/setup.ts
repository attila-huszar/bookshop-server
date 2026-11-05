import * as db from '@/db'
import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/process.utils'
import { MIGRATIONS_DIR } from '@/constants/paths'
import { processTiming } from '@/constants/process'
import { DB_REPO } from '@/types/enums'
import { seedAuthors, seedBooks, seedNews, seedUsers } from './seeds'

if (import.meta.main) {
  await runProcess({
    name: 'Database setup',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
      const config = validateEnv('setup')

      context.defer('database', db.closeDatabase)

      await context.wait(db.connectDatabase())
      context.signal.throwIfAborted()

      // MongoDB initializes collections and indexes during connection.
      if (config.dbRepo === DB_REPO.SQLITE) {
        const { migrate } = await import('drizzle-orm/bun-sqlite/migrator')

        const { sqlite } = await import('./sqlite')

        context.signal.throwIfAborted()
        migrate(sqlite, { migrationsFolder: MIGRATIONS_DIR })
      }

      await db.assertDatabaseSchema()
      context.signal.throwIfAborted()

      console.info('🌱 Starting database seed...')

      const summary: Record<string, { inserted: number; existing: number }> = {}

      // Authors must exist before books; check cancellation between writes.
      for (const seed of [seedAuthors, seedBooks, seedNews, seedUsers]) {
        context.signal.throwIfAborted()
        Object.assign(summary, await seed())
      }

      context.signal.throwIfAborted()

      console.info('✅ Database setup completed!')
      console.info(summary)
    },
  })
}
