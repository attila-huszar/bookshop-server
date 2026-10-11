import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const databaseUrl = new URL('../db.ts', import.meta.url).href
const envUrl = new URL('../config/env.ts', import.meta.url).href

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
        assert.equal(db.sqliteClient, undefined)
        try {
          await db.connectDatabase()
          const first = db.sqliteClient
          await db.connectDatabase()
          assert.equal(db.sqliteClient, first)
          first.run('CREATE TABLE smoke (id INTEGER PRIMARY KEY)')
          assert.equal(first.query('PRAGMA foreign_keys').get().foreign_keys, 1)
          assert.equal(first.query('PRAGMA busy_timeout').get().timeout, 5000)
          await db.closeDatabase()
          assert.equal(db.sqliteClient, undefined)
          await db.connectDatabase()
          const tables = db.sqliteClient.query("SELECT count(*) AS total FROM sqlite_master WHERE name = 'smoke'").get()
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
  it('fails clearly if Mongo connects without initializing a database', async () => {
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '-e',
        `
          import assert from 'node:assert/strict'
          import { mock } from 'bun:test'
          const connect = mock(async () => undefined)
          await mock.module('mongoose', () => ({
            default: { connect, connection: { db: undefined } },
          }))
          const db = await import(${JSON.stringify(databaseUrl)})
          assert.equal(connect.mock.calls.length, 0)
          await assert.rejects(db.connectDatabase(), /MongoDB connection is not initialized/)
          await assert.rejects(db.connectDatabase(), /MongoDB connection is not initialized/)
          assert.equal(connect.mock.calls.length, 2)
        `,
      ],
      {
        cwd: projectRoot,
        env: { ...process.env, DB_REPO: 'MONGO' },
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
      const childEnv = { ...process.env }

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
