import { describe, expect, it } from 'bun:test'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const sourceRoot = new URL('../', import.meta.url).href

const scenarios = [
  {
    name: 'email helpers, mail transport and errors',
    modules: ['utils/email.utils.ts', 'libs/nodemailer.ts', 'errors/index.ts'],
    paymentClient: false,
    workerClients: false,
  },
  {
    name: 'catalogue, account and CMS routes',
    modules: [
      'controller/books.controller.ts',
      'controller/authors.controller.ts',
      'controller/news.controller.ts',
      'controller/bookSearchOptions.controller.ts',
      'controller/users.controller.ts',
      'controller/terms.controller.ts',
      'controller/cms.controller.ts',
      'middleware/auth.middleware.ts',
      'middleware/optionalAuth.middleware.ts',
    ],
    paymentClient: false,
    workerClients: false,
  },
  {
    name: 'email worker',
    modules: ['workers/email.worker.ts'],
    paymentClient: false,
    workerClients: true,
  },
  {
    name: 'API composition root',
    modules: ['app.ts'],
    paymentClient: true,
    workerClients: false,
  },
]

describe.each(['SQLITE', 'MONGO'])('%s module boundaries', (dbRepo) => {
  it.each(scenarios)(
    'imports $name without unrelated clients or database connections',
    async (scenario) => {
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '-e',
          `
            import assert from 'node:assert/strict'
            import { mock } from 'bun:test'
            const deadline = setTimeout(() => process.exit(2), 10000)
            const scenario = ${JSON.stringify(scenario)}
            let queues = 0
            let workers = 0
            class Stripe {
              constructor() {
                assert.ok(scenario.paymentClient, 'Unexpected Stripe client initialization')
              }
            }
            await mock.module('stripe', () => ({ Stripe, default: Stripe }))
            await mock.module('nodemailer', () => ({
              default: { createTransport() { throw new Error('Unexpected SMTP connection') } },
            }))
            await mock.module('bullmq', () => ({
              Queue: class {
                constructor() {
                  assert.ok(scenario.workerClients, 'Unexpected Redis queue connection')
                  queues++
                }
                on() { return this }
              },
              Worker: class {
                constructor() {
                  assert.ok(scenario.workerClients, 'Unexpected Redis worker connection')
                  workers++
                }
                on() { return this }
              },
            }))
            for (const path of scenario.modules) {
              await import(new URL(path, ${JSON.stringify(sourceRoot)}).href)
            }
            const mongoose = (await import('mongoose')).default
            const db = await import(new URL('db.ts', ${JSON.stringify(sourceRoot)}).href)
            assert.equal(mongoose.connection.readyState, 0)
            assert.equal(db.sqliteClient, undefined)
            assert.equal(queues, scenario.workerClients ? 1 : 0)
            assert.equal(workers, scenario.workerClients ? 1 : 0)
            clearTimeout(deadline)
            process.exit(0)
          `,
        ],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            DB_REPO: dbRepo,
            DB_MONGO_URL: 'mongodb://127.0.0.1:1/import-test',
            DB_SQLITE_FILE: ':memory:',
            STRIPE_SECRET: '',
            STRIPE_WEBHOOK_SECRET: '',
            MAILER_USER: '',
            MAILER_PASS: '',
            REDIS_URL: '',
            AWS_ACCESS_KEY_ID: '',
            AWS_SECRET_ACCESS_KEY: '',
            NGROK_AUTHTOKEN: '',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      const [exitCode, stderr] = await Promise.all([
        child.exited,
        new Response(child.stderr).text(),
      ])

      expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
    },
  )
})
