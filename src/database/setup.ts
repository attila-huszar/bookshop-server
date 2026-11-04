import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/processLifecycle.utils'
import { processTiming } from '@/constants/process'
import { DB_REPO } from '@/types/enums'

if (import.meta.main) {
  await runProcess({
    name: 'Database setup',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
      const config = validateEnv('seed')
      const db = await import('@/db')
      context.defer('database', db.closeDatabase)
      await context.wait(db.connectDatabase())
      context.signal.throwIfAborted()
      if (config.dbRepo === DB_REPO.SQLITE) {
        const { migrateDatabase } = await import('./migrate')
        await migrateDatabase()
      }
      const { seedDatabase } = await import('./seed')
      context.signal.throwIfAborted()
      await seedDatabase(context.signal)
    },
  })
}
