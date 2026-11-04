import { describe, expect, it } from 'bun:test'
import { fileURLToPath } from 'node:url'
import { createApp } from '@/app'

describe('readiness and liveness', () => {
  it('returns 503 while dependencies are unavailable or the API is draining', async () => {
    let ready = false
    const app = createApp(() => ready)

    expect((await app.request('/health')).status).toBe(200)
    expect((await app.request('/ready')).status).toBe(503)

    ready = true
    expect((await app.request('/ready')).status).toBe(200)

    ready = false
    expect((await app.request('/ready')).status).toBe(503)
    expect((await app.request('/health')).status).toBe(200)
  })

  it('rejects an empty SQLite schema and becomes unready after close', async () => {
    const db = new URL('../db.ts', import.meta.url).href
    const migrations = fileURLToPath(
      new URL('../database/migrations/', import.meta.url),
    )
    const child = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '-e',
        `
      import assert from 'node:assert/strict'
      const db = await import(${JSON.stringify(db)})
      const sqlite = await import(${JSON.stringify(new URL('../database/sqlite.ts', import.meta.url).href)})

      await db.connectDatabase()
      assert.equal(db.isDatabaseReady(), false)
      await assert.rejects(db.assertDatabaseSchema(), /schema is incomplete/)

      const { migrate } = await import('drizzle-orm/bun-sqlite/migrator')
      migrate(sqlite.sqlite, { migrationsFolder: ${JSON.stringify(migrations)} })
      await db.assertDatabaseSchema()
      assert.equal(db.isDatabaseReady(), true)

      sqlite.sqliteClient.run('ALTER TABLE books DROP COLUMN description')
      await assert.rejects(db.assertDatabaseSchema(), /books.description/)
      assert.equal(db.isDatabaseReady(), false)

      await db.closeDatabase()
      assert.equal(db.isDatabaseReady(), false)
    `,
      ],
      {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
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
})
