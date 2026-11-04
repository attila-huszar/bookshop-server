import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/process.utils'
import { processTiming } from '@/constants/process'
import { DB_REPO } from '@/types/enums'

if (import.meta.main) {
  await runProcess({
    name: 'Database setup',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
      const config = validateEnv('setup')

      const db = await import('@/db')
      context.defer('database', db.closeDatabase)

      await context.wait(db.connectDatabase())
      context.signal.throwIfAborted()

      /**
       * Only SQLite uses SQL migrations. MongoDB initializes its collections
       * and indexes during connectDatabase().
       */
      if (config.dbRepo === DB_REPO.SQLITE) {
        const { migrate } = await import('drizzle-orm/bun-sqlite/migrator')

        const { sqlite } = await import('./sqlite')

        const { MIGRATIONS_DIR } = await import('@/constants/paths')

        context.signal.throwIfAborted()
        migrate(sqlite, { migrationsFolder: MIGRATIONS_DIR })
      }

      await db.assertDatabaseSchema()
      context.signal.throwIfAborted()

      const { seedAuthors, seedBooks, seedNews, seedUsers } =
        await import('./seeds')

      console.info('🌱 Starting database seed...')

      const summary: Record<string, number | string> = {}

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
