import { validateEnv } from '@/config/validateEnv'
import { runProcess } from '@/utils/process.utils'
import { log } from '@/libs/logger'
import { processTiming } from '@/constants/process'

if (import.meta.main) {
  await runProcess({
    name: 'Server',
    shutdownMs: processTiming.apiShutdownMs,
    start: async (context) => {
      const config = validateEnv('api')

      const db = await import('./db')
      context.defer('database', db.closeDatabase)

      await context.wait(db.connectDatabase())
      await db.assertDatabaseSchema()
      context.signal.throwIfAborted()

      const { getStripe } = await import('./libs/stripe')
      getStripe()

      const ngrok = config.ngrokAuthToken
        ? await import('./utils/ngrok')
        : undefined

      if (ngrok) {
        context.defer('ngrok tunnel', ngrok.closeNgrokTunnel)
      }

      const { createApp } = await import('./app')
      context.signal.throwIfAborted()

      const app = createApp(
        () => !context.signal.aborted && db.isDatabaseReady(),
      )

      const server = Bun.serve({
        fetch: app.fetch,
        port: Number(config.port),
        hostname: '0.0.0.0',
      })

      context.defer('HTTP requests', () => server.stop())

      context.force(() => {
        void server.stop(true)
      })

      log.info('Server started', {
        hostname: server.hostname,
        port: server.port,
      })

      if (ngrok) {
        void ngrok.ngrokForward().catch((error: unknown) => {
          log.error('Failed to establish ngrok tunnel', { error })
        })
      }
    },
  })
}
