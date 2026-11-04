import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const databaseUrl = new URL('../db.ts', import.meta.url).href
const sqliteUrl = new URL('../database/sqlite.ts', import.meta.url).href
const envUrl = new URL('../config/env.ts', import.meta.url).href
const modelsUrl = new URL('../models/mongo/index.ts', import.meta.url).href

// A subprocess exercises the real bootstrap, outside the suite's module mocks.
async function checkBootstrap(filename: string, cwd = projectRoot) {
  const child = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      '-e',
      `
        import assert from 'node:assert/strict'
        process.chdir(${JSON.stringify(cwd)})
        const db = await import(${JSON.stringify(databaseUrl)})
        const connection = await import(${JSON.stringify(sqliteUrl)})
        assert.equal(connection.sqliteClient, undefined)

        try {
          await db.connectDatabase()
          const first = connection.sqliteClient
          await db.connectDatabase()
          assert.equal(connection.sqliteClient, first)

          first.run('CREATE TABLE smoke (id INTEGER PRIMARY KEY)')
          assert.equal(first.query('PRAGMA foreign_keys').get().foreign_keys, 1)
          assert.equal(first.query('PRAGMA busy_timeout').get().timeout, 5000)

          await db.closeDatabase()
          assert.equal(connection.sqliteClient, undefined)

          await db.connectDatabase()

          const tables = connection.sqliteClient.query("SELECT count(*) AS total FROM sqlite_master WHERE name = 'smoke'").get()

          assert.equal(tables.total, ${filename === ':memory:' ? 0 : 1})
        } finally {
          await db.closeDatabase()
        }
      `,
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, DB_REPO: 'SQLITE', DB_SQLITE_FILE: filename },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [exitCode, stderr] = await Promise.all([
    child.exited,
    new Response(child.stderr).text(),
  ])

  expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
}

describe('database bootstrap', () => {
  it('loads Mongo models without payment credentials or a database connection', async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '-e',
        `
          import assert from 'node:assert/strict'
          const models = await import(${JSON.stringify(modelsUrl)})
          assert.equal(models.BookModel.modelName, 'Book')
          assert.equal(models.BookModel.db.readyState, 0)
        `,
      ],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          STRIPE_SECRET: '',
          STRIPE_WEBHOOK_SECRET: '',
          MAILER_USER: '',
          MAILER_PASS: '',
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
  })

  it.each([
    {
      scenario: 'Mongo connects without initializing a database',
      uri: 'mongodb+srv://user:secret@cluster.test/bookshop?authSource=admin',
      errorMessage: 'MongoDB connection is not initialized',
      connectionAttempts: 2,
    },
    {
      scenario: 'the Mongo connection URI is missing',
      uri: '',
      errorMessage: 'MongoDB requires DB_MONGO_URL',
      connectionAttempts: 0,
    },
  ])(
    'fails clearly when $scenario',
    async ({ uri, errorMessage, connectionAttempts }) => {
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '-e',
          `
          import assert from 'node:assert/strict'
          import { mock } from 'bun:test'
          const connect = mock(async () => undefined)
          const close = mock(async () => undefined)
          await mock.module('mongoose', () => ({
            default: { connect, connection: { db: undefined, close } },
          }))
          const db = await import(${JSON.stringify(databaseUrl)})
          assert.equal(connect.mock.calls.length, 0)
          await assert.rejects(db.connectDatabase(), { message: ${JSON.stringify(errorMessage)} })
          await assert.rejects(db.connectDatabase(), { message: ${JSON.stringify(errorMessage)} })
          assert.equal(connect.mock.calls.length, ${connectionAttempts})
          assert.equal(close.mock.calls.length, ${connectionAttempts > 0 ? 2 : 0})
          if (${connectionAttempts} > 0) {
            assert.equal(connect.mock.calls[0][0], ${JSON.stringify(uri)})
          }
        `,
        ],
        {
          cwd: projectRoot,
          env: { ...process.env, DB_REPO: 'MONGO', DB_MONGO_URL: uri },
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

  it('closes failed MongoDB connections before retries and discards credential-bearing errors', async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '-e',
        `
          import assert from 'node:assert/strict'
          import { mock } from 'bun:test'
          const connect = mock(async () => {
            throw Object.assign(new Error('mongodb://user:private-password@host.test/bookshop'), { code: 18 })
          })
          const close = mock(async () => undefined)
          await mock.module('mongoose', () => ({ default: { connect, connection: { close } } }))
          const db = await import(${JSON.stringify(databaseUrl)})
          for (let attempt = 0; attempt < 2; attempt++) {
            await assert.rejects(db.connectDatabase(), (error) => {
              assert.equal(error.name, 'DatabaseStartupError')
              assert.match(error.message, /authentication failed/)
              assert.equal(error.cause, undefined)
              assert.ok(!error.stack.includes('private-password'))
              return true
            })
          }
          assert.equal(connect.mock.calls.length, 2)
          assert.equal(close.mock.calls.length, 2)
        `,
      ],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          DB_REPO: 'MONGO',
          DB_MONGO_URL: 'mongodb://user:private-password@host.test/bookshop',
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
  })

  it('closes and clears SQLite handles after failed initialization', async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '-e',
        `
          import assert from 'node:assert/strict'
          import { mock } from 'bun:test'
          import { Database } from 'bun:sqlite'
          const close = mock(() => undefined)
          const originalClose = Database.prototype.close
          Database.prototype.run = () => {
            throw Object.assign(new Error('readonly'), { code: 'SQLITE_READONLY' })
          }
          Database.prototype.close = function () {
            close()
            originalClose.call(this)
          }
          const db = await import(${JSON.stringify(databaseUrl)})
          const connection = await import(${JSON.stringify(sqliteUrl)})
          for (let attempt = 0; attempt < 2; attempt++) {
            await assert.rejects(db.connectDatabase(), /SQLite is not writable/)
            assert.equal(connection.sqliteClient, undefined)
          }
          assert.equal(close.mock.calls.length, 2)
        `,
      ],
      {
        cwd: projectRoot,
        env: { ...process.env, DB_REPO: 'SQLITE', DB_SQLITE_FILE: ':memory:' },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const [exitCode, stderr] = await Promise.all([
      child.exited,
      new Response(child.stderr).text(),
    ])

    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' })
  })

  it('opens and reopens an in-memory SQLite database without a directory', async () => {
    await checkBootstrap(':memory:')
  })

  it('supports a bare SQLite filename in the current directory', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-db-test-'))

    try {
      await checkBootstrap('db.sqlite', directory)
    } finally {
      for (const suffix of ['', '-wal', '-shm']) {
        await rm(join(directory, `db.sqlite${suffix}`), { force: true })
      }

      await rmdir(directory)
    }
  })
})

describe('database selection', () => {
  it.each([
    [undefined, 'SQLITE'],
    ['SQLITE', 'SQLITE'],
    ['MONGO', 'MONGO'],
    ['MONGOO', null],
    ['', null],
  ] as const)(
    'validates DB_REPO=%s before selecting an adapter',
    async (value, expected) => {
      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        DB_MONGO_URL: 'mongodb://localhost/bookshop',
      }

      if (value === undefined) {
        delete childEnv.DB_REPO
      } else {
        childEnv.DB_REPO = value
      }

      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '-e',
          `
        const { env } = await import(${JSON.stringify(envUrl)})
        const { validateDatabaseEnv } = await import(new URL('./validateEnv.ts', ${JSON.stringify(envUrl)}).href)
        validateDatabaseEnv()
        console.log(env.dbRepo)
      `,
        ],
        { cwd: projectRoot, env: childEnv, stdout: 'pipe', stderr: 'pipe' },
      )
      const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      if (expected === null) {
        expect(exitCode).not.toBe(0)
        expect(stderr).toContain('Invalid DB_REPO')
      } else {
        expect({ exitCode, stdout: stdout.trim(), stderr }).toEqual({
          exitCode: 0,
          stdout: expected,
          stderr: '',
        })
      }
    },
  )
})
