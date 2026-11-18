import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/process.utils'
import { processTiming } from '@/constants/process'
import { registerCronJob } from './shared/cronJob'

if (import.meta.main) {
  await runProcess({
    name: 'Maintenance',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
      await registerCronJob(context)

      validateEnv('maintenance')

      const deadline = setTimeout(
        () =>
          context.fail(
            new Error('Maintenance exceeded its nine-minute time limit'),
          ),
        processTiming.maintenanceTimeoutMs,
      )
      context.defer('maintenance deadline', () => clearTimeout(deadline))

      const db = await import('@/db')
      context.defer('database', db.closeDatabase)

      await context.waitForStartup(db.connectDatabase())
      await db.assertDatabaseSchema()
      context.signal.throwIfAborted()

      const { runMaintenance } = await import('@/services/maintenance.service')
      const succeeded = await runMaintenance(undefined, context.signal)

      if (!succeeded) {
        throw new Error('One or more maintenance tasks failed')
      }
    },
  })
}
