import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { withSqliteArchive } from '@/scripts/backup'

describe('SQLite backup archives', () => {
  it.skipIf(!Bun.which('sqlite3'))(
    'backs up committed WAL data into a valid gzip archive and removes scratch files',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'bookshop-sqlite-source-'))
      const source = join(directory, 'source.sqlite')
      const database = new Database(source, { create: true })
      let archiveDirectory = ''

      try {
        database.run('PRAGMA journal_mode = WAL')
        database.run('PRAGMA wal_autocheckpoint = 0')
        database.run(
          'CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT)',
        )
        database.run("INSERT INTO records VALUES (1, 'committed')")
        database.run('BEGIN')
        database.run("INSERT INTO records VALUES (2, 'uncommitted')")

        await withSqliteArchive({
          source,
          consume: async (archive) => {
            archiveDirectory = dirname(archive.name!)
            const restoredFile = join(directory, 'restored.sqlite')
            await Bun.write(restoredFile, gunzipSync(await archive.bytes()))
            const restored = new Database(restoredFile, { readonly: true })

            try {
              expect(
                restored.query('SELECT * FROM records ORDER BY id').all(),
              ).toEqual([{ id: 1, value: 'committed' }])
              expect(restored.query('PRAGMA integrity_check').get()).toEqual({
                integrity_check: 'ok',
              })
            } finally {
              restored.close()
            }
          },
        })

        expect(
          database.query('SELECT COUNT(*) AS count FROM records').get(),
        ).toEqual({ count: 2 })
        await rejects(stat(archiveDirectory), { code: 'ENOENT' })
      } finally {
        database.close()
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it('rejects a missing source without creating a new database', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-sqlite-missing-'))
    const source = join(directory, 'missing.sqlite')

    try {
      await rejects(
        withSqliteArchive({ source, consume: () => Promise.resolve() }),
        /SQLite file not found/,
      )
      expect(await Bun.file(source).exists()).toBe(false)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
