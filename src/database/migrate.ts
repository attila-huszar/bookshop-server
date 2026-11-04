import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/processLifecycle.utils'
import { processTiming } from '@/constants/process'

export async function migrateDatabase(): Promise<void> {
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator')
  const { sqlite } = await import('@/db')
  const { MIGRATIONS_DIR } = await import('@/constants/paths')
  migrate(sqlite, { migrationsFolder: MIGRATIONS_DIR })
}

if (import.meta.main) {
  await runProcess({
    name: 'Database migration',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
      validateEnv('migrate')
      const db = await import('@/db')
      context.defer('database', db.closeDatabase)
      await context.wait(db.connectDatabase())
      context.signal.throwIfAborted()
      await migrateDatabase()
      console.info('Database migrated ✅')
    },
  })
}
