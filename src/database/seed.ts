import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/processLifecycle.utils'
import { processTiming } from '@/constants/process'

export async function seedDatabase(signal?: AbortSignal) {
  const { seedAuthors, seedBooks, seedNews, seedUsers } =
    await import('./seeds')
  console.info('🌱 Starting database seed...')

  signal?.throwIfAborted()
  const authors = await seedAuthors()
  signal?.throwIfAborted()
  const books = await seedBooks()
  signal?.throwIfAborted()
  const news = await seedNews()
  signal?.throwIfAborted()
  const users = await seedUsers()

  console.info('✅ Database seeded successfully!')
  console.info({ ...authors, ...books, ...news, ...users })
}

if (import.meta.main) {
  await runProcess({
    name: 'Database seed',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
      validateEnv('seed')
      const db = await import('@/db')
      context.defer('database', db.closeDatabase)
      await context.wait(db.connectDatabase())
      await db.assertDatabaseSchema()
      context.signal.throwIfAborted()
      await seedDatabase(context.signal)
    },
  })
}
