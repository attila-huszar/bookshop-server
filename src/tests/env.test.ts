import { describe, expect, it } from 'bun:test'
import type { ProcessRole } from '@/config/validateEnv'

const envUrl = new URL('../config/env.ts', import.meta.url).href
const validatorUrl = new URL('../config/validateEnv.ts', import.meta.url).href

async function readConfig(input: {
  mode?: string
  dbRepo?: string
  role?: ProcessRole
}) {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DB_REPO: input.dbRepo ?? 'MONGO',
    DB_MONGO_URL: 'mongodb://mongo.test/bookshop',
    DB_SQLITE_FILE: ':memory:',
    CLIENT_BASE_URL: 'https://bookshop.test',
    COOKIE_SECRET: 'test-cookie',
    ACCESS_TOKEN_SECRET: 'test-access',
    REFRESH_TOKEN_SECRET: 'test-refresh',
    STRIPE_SECRET: 'unused-test-secret',
    STRIPE_WEBHOOK_SECRET: 'unused-test-webhook',
    AWS_BUCKET: 'test-bucket',
    AWS_REGION: 'eu-central-1',
    AWS_ACCESS_KEY_ID: 'unused',
    AWS_SECRET_ACCESS_KEY: 'unused',
    REDIS_URL: 'redis://127.0.0.1:1',
    MAILER_USER: 'test@example.test',
    MAILER_PASS: 'unused',
    MAILER_PORT: '465',
    PORT: '0',
    BACKUP_RETENTION_DRY_RUN: 'false',
  }

  if (input.mode === undefined) {
    delete childEnv.MONGO_BACKUP_MODE
  } else {
    childEnv.MONGO_BACKUP_MODE = input.mode
  }

  const script = input.role
    ? 'const { validateEnv } = await import(' +
      JSON.stringify(validatorUrl) +
      '); validateEnv(' +
      JSON.stringify(input.role) +
      '); console.log("VALID")'
    : 'console.log(env.mongoBackupMode)'
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '-e',
      'const { env } = await import(' +
        JSON.stringify(envUrl) +
        '); console.log("IMPORTED"); ' +
        script,
    ],
    { env: childEnv, stdout: 'pipe', stderr: 'pipe' },
  )
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  return { code, stdout: stdout.trim(), stderr }
}

describe('validated environment enums', () => {
  it.each([
    { mode: undefined, expected: 'logical' },
    { mode: 'logical', expected: 'logical' },
    { mode: 'oplog', expected: 'oplog' },
  ])('parses backup mode $mode', async ({ mode, expected }) => {
    expect(await readConfig({ mode })).toEqual({
      code: 0,
      stdout: 'IMPORTED\n' + expected,
      stderr: '',
    })
  })

  it.each(['', 'LOGICAL', 'invalid'])(
    'rejects invalid modes on access rather than during import: %s',
    async (mode) => {
      const result = await readConfig({ mode })

      expect(result.code).not.toBe(0)
      expect(result.stdout).toBe('IMPORTED')
      expect(result.stderr).toContain('Invalid MONGO_BACKUP_MODE')
    },
  )

  it.each<ProcessRole>(['api', 'worker'])(
    'keeps an unused invalid backup mode out of %s startup',
    async (role) => {
      expect(await readConfig({ mode: 'invalid', role })).toEqual({
        code: 0,
        stdout: 'IMPORTED\nVALID',
        stderr: '',
      })
    },
  )

  it('ignores Mongo backup settings for SQLite backups', async () => {
    expect(
      await readConfig({ dbRepo: 'SQLITE', mode: 'invalid', role: 'backup' }),
    ).toEqual({
      code: 0,
      stdout: 'IMPORTED\nVALID',
      stderr: '',
    })
  })

  it('validates the Mongo backup mode during backup startup', async () => {
    const result = await readConfig({ mode: 'invalid', role: 'backup' })

    expect(result.code).not.toBe(0)
    expect(result.stdout).toBe('IMPORTED')
    expect(result.stderr).toContain('Invalid MONGO_BACKUP_MODE')
  })
})
