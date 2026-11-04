import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/process.utils'
import { log } from '@/libs/logger'
import { processTiming } from '@/constants/process'

if (import.meta.main) {
  await runProcess({
    name: 'Email worker',
    shutdownMs: processTiming.workerShutdownMs,
    start: async (context) => {
      validateEnv('worker')

      const db = await import('@/db')
      context.defer('database', db.closeDatabase)

      await context.wait(db.connectDatabase())
      await db.assertDatabaseSchema()
      context.signal.throwIfAborted()

      const { createEmailQueue } = await import('@/queues/emailQueue')
      const queue = createEmailQueue()
      context.defer('email queue', () => queue.close())

      const { closeMailer } = await import('@/libs/nodemailer')
      context.defer('SMTP pool', closeMailer)

      const { createEmailWorker } = await import('./workers/emailWorker')
      context.signal.throwIfAborted()

      const worker = createEmailWorker()

      // Cleanup may run before startup has created the relay.
      let relay: { close: () => Promise<void> } | undefined = undefined

      context.defer('email processing', async () => {
        // Stop both sources of new work before waiting for either drain.
        const results = await Promise.allSettled([
          worker.close(),
          relay?.close(),
        ])

        const failed = results.find((result) => result.status === 'rejected')

        if (failed?.status === 'rejected') {
          throw failed.reason
        }
      })

      await context.wait(worker.waitUntilReady())
      context.signal.throwIfAborted()

      const { startOutboxRelay } = await import('@/services/outbox.service')
      const { outboxDB } = await import('@/repositories')
      context.signal.throwIfAborted()

      relay = startOutboxRelay({ repository: outboxDB, queue })
      void worker.run().catch(context.fail)

      log.info('Email processing started')
    },
  })
}
