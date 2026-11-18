import { describe, expect, it } from 'bun:test'
import type { ProcessRole } from '@/config/validateEnv'

const envUrl = new URL('../config/env.ts', import.meta.url).href
const validatorUrl = new URL('../config/validateEnv.ts', import.meta.url).href

async function readConfig(input: {
  mode?: string
  dbRepo?: string
  role?: ProcessRole
  mongoUrl?: string
  readNamespace?: boolean
  backupRetention?: string
  readRetention?: boolean
  nodeEnv?: string
}) {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: input.nodeEnv ?? 'development',
    DB_REPO: input.dbRepo ?? 'MONGO',
    DB_MONGO_URL: input.mongoUrl ?? 'mongodb://mongo.test/bookshop',
    DB_SQLITE_FILE: ':memory:',
    ADMIN_EMAIL: 'admin@example.test',
    ADMIN_PASSWORD: 'unused-test-password',
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

  if (input.backupRetention === undefined) {
    delete childEnv.BACKUP_RETENTION
  } else {
    childEnv.BACKUP_RETENTION = input.backupRetention
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
    : input.readRetention
      ? 'console.log(JSON.stringify(env.backupRetention))'
      : input.readNamespace
        ? 'console.log(env.databaseNamespace)'
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

  it.each(['', 'LOGICAL', 'invalid', 'snapshot', 'snapshot-read'])(
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

describe('backup retention configuration', () => {
  it.each([
    { value: undefined, expected: { daily: 7, weekly: 4, monthly: 12 } },
    { value: '3,2,6', expected: { daily: 3, weekly: 2, monthly: 6 } },
    { value: ' 1, 0, 0 ', expected: { daily: 1, weekly: 0, monthly: 0 } },
  ])('parses retention $value', async ({ value, expected }) => {
    expect(
      await readConfig({ backupRetention: value, readRetention: true }),
    ).toEqual({
      code: 0,
      stdout: 'IMPORTED\n' + JSON.stringify(expected),
      stderr: '',
    })
  })

  it.each([
    '',
    '7,4',
    '7,4,12,1',
    '7,,12',
    '0,4,12',
    '7,-1,12',
    '7,4,1.5',
    '7,4,no',
    '7,4,9007199254740992',
  ])('rejects invalid retention before backup starts: %s', async (value) => {
    const result = await readConfig({
      backupRetention: value,
      role: 'backup',
    })

    expect(result.code).not.toBe(0)
    expect(result.stdout).toBe('IMPORTED')
    expect(result.stderr).toContain('BACKUP_RETENTION must be')
  })

  it.each<ProcessRole>(['api', 'worker'])(
    'keeps unused invalid backup retention out of %s startup',
    async (role) => {
      expect(await readConfig({ backupRetention: 'invalid', role })).toEqual({
        code: 0,
        stdout: 'IMPORTED\nVALID',
        stderr: '',
      })
    },
  )
})

describe('database storage isolation', () => {
  it.each([
    { database: 'bookshop-dev', nodeEnv: 'development' },
    { database: 'bookshop-prod', nodeEnv: 'production' },
    { database: 'bookshop-dev', nodeEnv: 'production' },
    { database: 'bookshop-prod', nodeEnv: 'development' },
    { database: 'bookshop', nodeEnv: 'production' },
  ])(
    'scopes Mongo storage to $database when NODE_ENV=$nodeEnv',
    async ({ database, nodeEnv }) => {
      expect(
        await readConfig({
          mongoUrl: `mongodb+srv://user:private-password@cluster.test/${database}?authSource=admin`,
          readNamespace: true,
          nodeEnv,
        }),
      ).toEqual({
        code: 0,
        stdout: `IMPORTED\nmongo/${database}`,
        stderr: '',
      })
    },
  )

  it('keeps SQLite storage independent of Mongo settings', async () => {
    expect(
      await readConfig({
        dbRepo: 'SQLITE',
        mongoUrl: 'invalid',
        readNamespace: true,
      }),
    ).toEqual({ code: 0, stdout: 'IMPORTED\nsqlite', stderr: '' })
  })

  it.each<ProcessRole>(['api', 'worker', 'maintenance', 'backup', 'setup'])(
    'rejects an implicit Mongo database before %s starts',
    async (role) => {
      const result = await readConfig({
        role,
        mongoUrl:
          'mongodb://user:private-password@mongo.test/?authSource=admin',
      })

      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain(
        'DB_MONGO_URL must include an explicit database name',
      )
      expect(result.stderr).not.toContain('private-password')
    },
  )
})
