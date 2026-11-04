import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import authorsData from '@/database/seeds/authors.json'
import booksData from '@/database/seeds/books.json'
import newsData from '@/database/seeds/news.json'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const databaseUrl = new URL('../db.ts', import.meta.url).href
const seedsUrl = new URL('../database/seeds/index.ts', import.meta.url).href
const migratorUrl = import.meta.resolve('drizzle-orm/bun-sqlite/migrator')

async function runSetup(
  input: { env?: NodeJS.ProcessEnv; preload?: string } = {},
) {
  const command = [process.execPath, '--no-env-file']

  if (input.preload) {
    command.push('--preload', input.preload)
  }

  command.push('src/database/setup.ts')

  const child = Bun.spawn(command, {
    cwd: projectRoot,
    env: {
      ...process.env,
      DB_REPO: 'SQLITE',
      DB_SQLITE_FILE: ':memory:',
      ADMIN_EMAIL: 'setup@example.test',
      ADMIN_PASSWORD: 'setup-test-password',
      BOOKSHOP_CRON_JOB_DIRECTORY: '',
      LOG_LEVEL: 'info',
      ...input.env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  return { exitCode, stdout, stderr }
}

function readSeededData(filename: string) {
  const database = new Database(filename, { readonly: true })

  try {
    return {
      authors: database.query('SELECT COUNT(*) AS total FROM authors').get(),
      books: database.query('SELECT COUNT(*) AS total FROM books').get(),
      news: database.query('SELECT COUNT(*) AS total FROM news').get(),
      users: database.query('SELECT email, role FROM users').all(),
    }
  } finally {
    database.close()
  }
}

describe('database setup command', () => {
  it('migrates and seeds a fresh SQLite database without clearing data on a repeated run', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-setup-sqlite-'))
    const filename = join(directory, 'db.sqlite')

    try {
      const result = await runSetup({ env: { DB_SQLITE_FILE: filename } })

      expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
        exitCode: 0,
        stderr: '',
      })
      expect(result.stdout).toContain('Database setup completed')

      const seeded = readSeededData(filename)

      expect(seeded).toEqual({
        authors: { total: authorsData.length },
        books: { total: booksData.length },
        news: { total: newsData.length },
        users: [{ email: 'setup@example.test', role: 'admin' }],
      })

      const repeated = await runSetup({ env: { DB_SQLITE_FILE: filename } })

      expect(repeated.exitCode).toBe(1)
      expect(repeated.stdout).toContain('Database setup failed')
      expect(readSeededData(filename)).toEqual(seeded)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    { scenario: 'completes all MongoDB seed steps', interrupt: false },
    {
      scenario: 'stops between MongoDB seed steps on cancellation',
      interrupt: true,
    },
  ])('$scenario', async ({ interrupt }) => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-setup-mongo-'))
    const preload = join(directory, 'preload.ts')

    try {
      await Bun.write(
        preload,
        `
        import { mock } from 'bun:test'

        setTimeout(() => process.exit(99), 4000).unref()

        await mock.module(${JSON.stringify(databaseUrl)}, () => ({
          connectDatabase: async () => console.log('DB_CONNECTED'),
          assertDatabaseSchema: async () => console.log('SCHEMA_READY'),
          closeDatabase: async () => console.log('DB_CLOSED'),
        }))

        await mock.module(${JSON.stringify(migratorUrl)}, () => ({
          migrate: () => {
            throw new Error('MongoDB setup must not run SQLite migrations')
          },
        }))

        const seed = (name) => async () => {
          console.log(name)

          if (name === 'AUTHORS_SEEDED' && ${JSON.stringify(interrupt)}) {
            process.emit('SIGTERM')
          }

          return {}
        }

        await mock.module(${JSON.stringify(seedsUrl)}, () => ({
          seedAuthors: seed('AUTHORS_SEEDED'),
          seedBooks: seed('BOOKS_SEEDED'),
          seedNews: seed('NEWS_SEEDED'),
          seedUsers: seed('USERS_SEEDED'),
        }))

      `,
      )

      const result = await runSetup({
        preload,
        env: {
          DB_REPO: 'MONGO',
          DB_MONGO_URL: 'mongodb://mongo.test/bookshop',
        },
      })

      expect({ exitCode: result.exitCode, stderr: result.stderr }).toEqual({
        exitCode: interrupt ? 1 : 0,
        stderr: '',
      })

      const steps = result.stdout
        .split('\n')
        .filter((line) => /^(DB_|SCHEMA_|\w+_SEEDED)/.test(line))
        .map((line) => line.trim())

      expect(steps).toEqual(
        interrupt
          ? ['DB_CONNECTED', 'SCHEMA_READY', 'AUTHORS_SEEDED', 'DB_CLOSED']
          : [
              'DB_CONNECTED',
              'SCHEMA_READY',
              'AUTHORS_SEEDED',
              'BOOKS_SEEDED',
              'NEWS_SEEDED',
              'USERS_SEEDED',
              'DB_CLOSED',
            ],
      )
      expect(result.stdout.includes('Database setup completed')).toBe(
        !interrupt,
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
