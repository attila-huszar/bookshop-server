import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const projectRoot = Bun.fileURLToPath(new URL('../../', import.meta.url))
const mongooseUrl = import.meta.resolve('mongoose')
const bullmqUrl = import.meta.resolve('bullmq')

describe.each([
  { entrypoint: 'src/server.ts', message: 'Server startup failed' },
  {
    entrypoint: 'src/worker.ts',
    message: 'Email worker startup failed',
  },
])('$entrypoint startup', (entrypoint) => {
  it.each([
    {
      scenario: 'the Atlas password placeholder is unchanged',
      uri: 'mongodb+srv://user:<db_password>@cluster.test/bookshop',
      code: 18,
      hint: 'still contains a placeholder',
    },
    {
      scenario: 'Atlas rejects the database credentials',
      uri: 'mongodb+srv://user:private-password@cluster.test/bookshop',
      code: 18,
      hint: 'authentication failed',
    },
    {
      scenario: 'the cluster is unreachable',
      uri: 'mongodb+srv://user:private-password@cluster.test/bookshop',
      code: 'ETIMEDOUT',
      hint: 'not reachable',
    },
  ])('fails cleanly when $scenario', async (scenario) => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-startup-test-'))
    const preload = join(directory, 'preload.ts')

    try {
      await Bun.write(
        preload,
        `
          import { mock } from 'bun:test'

          const mongoose = (await import(${JSON.stringify(mongooseUrl)})).default

          mongoose.connect = async () => {
            throw Object.assign(new Error('mongodb://user:private-password@private-host/bookshop'), {
              code: ${JSON.stringify(scenario.code)},
            })
          }
          mongoose.connection.close = async () => {
            console.log('Database closed')
          }

          await mock.module(${JSON.stringify(bullmqUrl)}, () => ({
            Queue: class {
              on() {
                return this
              }

              async close() {
                console.log('Queue closed')
              }
            },
            Worker: class {
              on() {
                return this
              }

              async run() {
                throw new Error('Unexpected worker processing')
              }

              async close() {
                console.log('Worker closed')
              }
            },
          }))

          setTimeout(() => process.exit(2), 10000).unref()
        `,
      )

      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--preload',
          preload,
          entrypoint.entrypoint,
        ],
        {
          cwd: projectRoot,
          env: {
            ...process.env,
            DB_REPO: 'MONGO',
            DB_MONGO_URL: scenario.uri,
            NODE_ENV: 'development',
            LOG_LEVEL: 'info',
            ADMIN_EMAIL: 'admin@example.test',
            ADMIN_PASSWORD: 'unused-test-password',
            CLIENT_BASE_URL: 'https://bookshop.test',
            COOKIE_SECRET: 'unused-test-cookie-secret',
            ACCESS_TOKEN_SECRET: 'unused-test-access-secret',
            REFRESH_TOKEN_SECRET: 'unused-test-refresh-secret',
            STRIPE_SECRET: 'sk_test_unused',
            STRIPE_WEBHOOK_SECRET: 'whsec_unused',
            AWS_ACCESS_KEY_ID: 'unused-test-access-key',
            AWS_SECRET_ACCESS_KEY: 'unused-test-secret-key',
            AWS_REGION: 'eu-central-1',
            AWS_BUCKET: 'unused-test-bucket',
            REDIS_URL: 'redis://127.0.0.1:1',
            MAILER_USER: 'unused@example.test',
            MAILER_PASS: 'unused-test-mail-password',
            NGROK_AUTHTOKEN: '',
          },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect({ exitCode, stderr }).toEqual({ exitCode: 1, stderr: '' })
      expect(stdout).toContain(entrypoint.message)
      expect(stdout).toContain(scenario.hint)
      if (!scenario.hint.includes('placeholder')) {
        expect(stdout).toContain('Database closed')
      }
      expect(stdout).not.toContain('private-password')
      expect(stdout).not.toContain('private-host')
      expect(stdout).not.toContain('Server started')
      expect(stdout).not.toContain('Unexpected worker processing')

      expect(stdout).not.toContain('Queue closed')
      expect(stdout).not.toContain('Worker closed')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
