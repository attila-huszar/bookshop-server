import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import authorsData from '@/database/seeds/authors.json'

const root = Bun.fileURLToPath(new URL('../../', import.meta.url))
const bullmq = import.meta.resolve('bullmq')
const env = {
  ...process.env,
  DB_REPO: 'SQLITE',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
  PORT: '0',
  MONGO_BACKUP_MODE: 'unused-api-value',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'unused-test-password',
  CLIENT_BASE_URL: 'https://bookshop.test',
  COOKIE_SECRET: 'test-secret',
  ACCESS_TOKEN_SECRET: 'test-access',
  REFRESH_TOKEN_SECRET: 'test-refresh',
  STRIPE_SECRET: 'sk_test_unused',
  STRIPE_WEBHOOK_SECRET: 'whsec_unused',
  AWS_ACCESS_KEY_ID: 'unused',
  AWS_SECRET_ACCESS_KEY: 'unused',
  AWS_REGION: 'eu-central-1',
  AWS_BUCKET: 'unused',
  REDIS_URL: 'redis://127.0.0.1:1',
  MAILER_USER: 'test@example.test',
  MAILER_PASS: 'unused',
  MAILER_PORT: '465',
  NGROK_AUTHTOKEN: '',
  BOOKSHOP_CRON_JOB_DIRECTORY: '',
}

async function prepare(directory: string) {
  const config = { ...env, DB_SQLITE_FILE: join(directory, 'db.sqlite') }

  const child = Bun.spawn(
    [process.execPath, '--no-env-file', 'src/database/setup.ts'],
    { cwd: root, env: config, stdout: 'pipe', stderr: 'pipe' },
  )

  const [code, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ])

  expect({ code, stderr }).toEqual({ code: 0, stderr: '' })

  return config
}

describe('service lifecycle integration', () => {
  it('does not repeat setup when a restart retains the old SETUP flag', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-setup-lifecycle-'))

    try {
      const config = await prepare(directory)
      const preload = join(directory, 'stop-after-start.ts')
      await Bun.write(
        preload,
        `
        const serve = Bun.serve
        Bun.serve = options => {
          const server = serve(options)

          setTimeout(() => process.emit('SIGTERM'), 10)

          return server
        }

        setTimeout(() => process.exit(99), 5000).unref()
      `,
      )

      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--preload',
          preload,
          'src/server.ts',
        ],
        {
          cwd: root,
          env: {
            ...config,
            SETUP: 'true',
            ADMIN_EMAIL: '',
            ADMIN_PASSWORD: '',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )

      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
      expect(stdout).toContain('Server started')
      expect(stdout).not.toContain('Starting database seed')

      const database = new Database(config.DB_SQLITE_FILE, { readonly: true })

      try {
        expect(
          database.query('SELECT COUNT(*) AS total FROM authors').get(),
        ).toEqual({ total: authorsData.length })
      } finally {
        database.close()
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    {
      entrypoint: 'src/server.ts',
      overrides: { STRIPE_SECRET: '' },
      field: 'STRIPE_SECRET',
    },
    {
      entrypoint: 'src/server.ts',
      overrides: { DB_REPO: 'INVALID' },
      field: 'DB_REPO',
    },
    {
      entrypoint: 'src/worker.ts',
      overrides: { REDIS_URL: '' },
      field: 'REDIS_URL',
    },
  ])(
    'reports invalid $field as a controlled startup failure',
    async (scenario) => {
      const child = Bun.spawn(
        [process.execPath, '--no-env-file', scenario.entrypoint],
        {
          cwd: root,
          env: { ...env, DB_SQLITE_FILE: ':memory:', ...scenario.overrides },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )

      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect({ code, stderr }).toEqual({ code: 1, stderr: '' })
      expect(stdout).toContain('startup failed')
      expect(stdout).toContain(scenario.field)
      expect(stdout).not.toContain('Server started')
    },
  )

  it('finishes an active HTTP request before closing the database on SIGTERM', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-api-lifecycle-'))
    let child: ReturnType<typeof Bun.spawn> | undefined

    try {
      const config = await prepare(directory)
      const preload = join(directory, 'http-preload.ts')
      await Bun.write(
        preload,
        `
        const serve = Bun.serve
        Bun.serve = (options) => serve({
          ...options,
          fetch: async (req) => {
            if (new URL(req.url).pathname === '/slow') {
              console.log('REQUEST_STARTED')

              // Exercise the registered handler without force-killing Windows.
              if (process.platform === 'win32') {
                setTimeout(() => process.emit('SIGTERM'), 10)
              }

              await new Promise((resolve) => setTimeout(resolve, 200))

              const { sqliteClient } = await import(${JSON.stringify(new URL('../database/sqlite.ts', import.meta.url).href)})
              sqliteClient.query('SELECT 1').get()

              return new Response('completed')
            }

            return options.fetch(req)
          },
        })

        setTimeout(() => process.exit(99), 10000).unref()
      `,
      )
      child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--preload',
          preload,
          'src/server.ts',
        ],
        { cwd: root, env: config, stdout: 'pipe', stderr: 'pipe' },
      )
      const reader = (child.stdout as ReadableStream<Uint8Array>).getReader()
      const decoder = new TextDecoder()

      let output = ''
      let port: number | undefined

      while (port === undefined) {
        const chunk = await reader.read()
        expect(chunk.done).toBe(false)

        if (chunk.done) {
          throw new Error(output)
        }

        output += decoder.decode(chunk.value)

        for (const line of output.split('\n')) {
          try {
            const event = JSON.parse(line) as { meta?: { port?: number } }
            port ??= event.meta?.port
          } catch {
            /* Wait for a complete JSON line. */
          }
        }
      }

      expect((await fetch(`http://127.0.0.1:${port}/ready`)).status).toBe(200)

      const response = fetch(`http://127.0.0.1:${port}/slow`)

      while (!output.includes('REQUEST_STARTED')) {
        const chunk = await reader.read()

        if (chunk.done) {
          throw new Error(output)
        }

        output += decoder.decode(chunk.value)
      }

      if (process.platform !== 'win32') {
        child.kill('SIGTERM')
      }

      expect(await (await response).text()).toBe('completed')
      expect(await child.exited).toBe(0)
      expect(await new Response(child.stderr as ReadableStream).text()).toBe('')
    } finally {
      child?.kill()
      await child?.exited
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('begins worker draining before waiting for the relay to finish', async () => {
    const directory = await mkdtemp(
      join(tmpdir(), 'bookshop-worker-lifecycle-'),
    )

    try {
      const config = await prepare(directory)
      const preload = join(directory, 'worker-preload.ts')
      await Bun.write(
        preload,
        `
        import { mock } from 'bun:test'

        let interval

        await mock.module(${JSON.stringify(bullmq)}, () => ({
          Queue: class {
            backend = { connection: { status: 'initializing', on() {} } }

            on() {
              return this
            }

            async close() {}
          },
          Worker: class {
            backend = {
              connection: { status: 'initializing', on() {} },
              blockingConnection: { status: 'initializing', on() {} },
            }

            on() {
              return this
            }

            async waitUntilReady() {}

            async close() {
              console.log('WORKER_DRAIN_STARTED')
              clearInterval(interval)
            }

            run() {
              interval = setInterval(() => {}, 1000)

              setTimeout(() => {
                if (process.platform === 'win32') {
                  process.emit('SIGTERM')
                } else {
                  process.kill(process.pid, 'SIGTERM')
                }
              }, 10)

              return new Promise(() => {})
            }
          },
        }))

        await mock.module(${JSON.stringify(new URL('../services/outbox.service.ts', import.meta.url).href)}, () => ({
          startOutboxRelay: () => ({
            close: async () => {
              await new Promise((resolve) => setTimeout(resolve, 100))
              console.log('RELAY_DRAIN_FINISHED')
            },
          }),
        }))

        setTimeout(() => process.exit(99), 10000).unref()
      `,
      )

      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--preload',
          preload,
          'src/worker.ts',
        ],
        { cwd: root, env: config, stdout: 'pipe', stderr: 'pipe' },
      )

      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect({ code, stderr }).toEqual({ code: 0, stderr: '' })
      expect(stdout.indexOf('WORKER_DRAIN_STARTED')).toBeGreaterThan(-1)
      expect(stdout.indexOf('RELAY_DRAIN_FINISHED')).toBeGreaterThan(
        stdout.indexOf('WORKER_DRAIN_STARTED'),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
