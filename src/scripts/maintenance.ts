import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/process.utils'
import { processTiming } from '@/constants/process'

if (import.meta.main) {
  await runProcess({
    name: 'Maintenance',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: async (context) => {
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
      await context.wait(db.connectDatabase())
      await db.assertDatabaseSchema()
      context.signal.throwIfAborted()
      const { runMaintenance } = await import('@/services/maintenance.service')
      if (!(await runMaintenance(undefined, context.signal))) {
        throw new Error('One or more maintenance tasks failed')
      }
    },
  })
}
