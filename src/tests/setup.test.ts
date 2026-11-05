import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { chmod, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import mongoose from 'mongoose'
import authorsData from '@/database/seeds/authors.json'
import booksData from '@/database/seeds/books.json'
import newsData from '@/database/seeds/news.json'

const projectRoot = Bun.fileURLToPath(new URL('../../', import.meta.url))
const databaseUrl = new URL('../db.ts', import.meta.url).href
const seedsUrl = new URL('../database/seeds/index.ts', import.meta.url).href
const migratorUrl = import.meta.resolve('drizzle-orm/bun-sqlite/migrator')
const authorsSeedUrl = new URL('../database/seeds/authors.ts', import.meta.url)
  .href

async function runSetup(
  input: {
    env?: NodeJS.ProcessEnv
    preload?: string
    command?: boolean
  } = {},
) {
  const command = [process.execPath, '--no-env-file']

  if (input.preload) {
    command.push('--preload', input.preload)
  }

  command.push(input.command ? 'src/scripts/setup.ts' : 'src/database/setup.ts')

  const child = Bun.spawn(command, {
    cwd: projectRoot,
    env: {
      ...process.env,
      DB_REPO: 'SQLITE',
      DB_SQLITE_FILE: ':memory:',
      ADMIN_EMAIL: 'setup@example.test',
      ADMIN_PASSWORD: 'setup-test-password',
      BOOKSHOP_CRON_JOB_DIRECTORY: '',
      BOOKSHOP_DATABASE_COORDINATION_DIR: '',
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

function snapshotSqlite(filename: string) {
  const database = new Database(filename, { readonly: true })

  try {
    return ['authors', 'books', 'news', 'users'].map((table) =>
      database.query(`SELECT * FROM ${table} ORDER BY id`).all(),
    )
  } finally {
    database.close()
  }
}

describe('database setup command', () => {
  it.each([
    {
      scenario: 'missing MongoDB settings',
      env: {
        DB_REPO: 'MONGO',
        ADMIN_EMAIL: undefined,
        ADMIN_PASSWORD: undefined,
        DB_MONGO_URL: undefined,
      },
      fields: 'ADMIN_EMAIL, ADMIN_PASSWORD, DB_MONGO_URL',
    },
    {
      scenario: 'blank MongoDB settings',
      env: {
        DB_REPO: 'MONGO',
        ADMIN_EMAIL: '  ',
        ADMIN_PASSWORD: '  ',
        DB_MONGO_URL: '  ',
      },
      fields: 'ADMIN_EMAIL, ADMIN_PASSWORD, DB_MONGO_URL',
    },
    {
      scenario: 'missing SQLite admin settings',
      env: {
        DB_REPO: 'SQLITE',
        ADMIN_EMAIL: undefined,
        ADMIN_PASSWORD: undefined,
      },
      fields: 'ADMIN_EMAIL, ADMIN_PASSWORD',
    },
    {
      scenario: 'blank SQLite path',
      env: { DB_REPO: 'SQLITE', DB_SQLITE_FILE: '  ' },
      fields: 'DB_SQLITE_FILE',
    },
  ])('reports $scenario before starting setup', async ({ env, fields }) => {
    const result = await runSetup({ env })

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain(
      `Missing required setup configuration: ${fields}. Check the server .env file or environment variables.`,
    )
    expect(result.stdout).not.toContain('Starting database seed')
    expect(result.stderr).toBe('')
  })

  it.each(['MONGO', 'SQLITE'])(
    'uses DB_REPO=%s from the setup command',
    async (dbRepo) => {
      const child = Bun.spawn([process.execPath, 'run', 'setup'], {
        cwd: projectRoot,
        env: {
          ...process.env,
          DB_REPO: dbRepo,
          DB_SQLITE_FILE: ':memory:',
          DB_MONGO_URL: '',
          ADMIN_EMAIL: '',
          ADMIN_PASSWORD: '',
          BOOKSHOP_CRON_JOB_DIRECTORY: '',
          LOG_LEVEL: 'info',
        },
        stdout: 'pipe',
        stderr: 'pipe',
      })

      const [code, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ])

      expect(code).toBe(1)
      const fields =
        dbRepo === 'MONGO'
          ? 'ADMIN_EMAIL, ADMIN_PASSWORD, DB_MONGO_URL'
          : 'ADMIN_EMAIL, ADMIN_PASSWORD'

      expect(stdout + stderr).toContain(
        `Missing required setup configuration: ${fields}.`,
      )
      expect(stdout + stderr).toContain('Check the server .env file')
    },
  )

  it.each([undefined, '', 'invalid'])(
    'rejects missing or invalid DB_REPO=%s before setup',
    async (dbRepo) => {
      const result = await runSetup({
        command: true,
        env: { DB_REPO: dbRepo },
      })

      expect(result.exitCode).toBe(1)
      expect(result.stdout).toContain(
        dbRepo ? 'Invalid DB_REPO' : 'Set DB_REPO to MONGO or SQLITE',
      )
      expect(result.stdout).not.toContain('Starting database seed')
    },
  )

  it.skipIf(process.platform === 'win32').each([0, 23])(
    'routes SQLite to Docker and handles container exit code %s',
    async (exitCode) => {
      const directory = await mkdtemp(join(tmpdir(), 'bookshop-setup-routing-'))
      const executable = join(directory, 'docker')
      const argsFile = join(directory, 'args.txt')
      const filename = join(directory, 'must-not-create.sqlite')

      try {
        await Bun.write(
          executable,
          '#!/bin/sh\nprintf "%s\\n" "$@" > "$SETUP_TEST_ARGS"\nexit "$SETUP_TEST_EXIT_CODE"\n',
        )
        await chmod(executable, 0o755)

        const result = await runSetup({
          command: true,
          env: {
            PATH: `${directory}:${process.env.PATH}`,
            DB_SQLITE_FILE: filename,
            SETUP_TEST_ARGS: argsFile,
            SETUP_TEST_EXIT_CODE: String(exitCode),
          },
        })
        const args = (await Bun.file(argsFile).text()).trim().split('\n')

        expect(result.exitCode).toBe(exitCode === 0 ? 0 : 1)
        expect(args.slice(0, 3)).toEqual(['compose', 'run', '--build'])
        expect(args).toContain('--rm')
        expect(args).toContain('--no-deps')
        expect(args).toContain('docker/database-access.sh')
        expect(args.at(-1)).toBe('src/database/setup.ts')
        expect(args).not.toContain('setup-test-password')
        expect(await Bun.file(filename).exists()).toBe(false)

        if (exitCode !== 0) {
          expect(result.stdout).toContain(
            `SQLITE setup process exited with code ${exitCode}`,
          )
        }
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it.skipIf(process.platform === 'win32')(
    'stops and waits for the SQLite setup child when interrupted',
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'bookshop-setup-cancel-'))
      const executable = join(directory, 'docker')

      try {
        await Bun.write(
          executable,
          '#!/bin/sh\ntrap \'echo CONTAINER_STOPPED; exit 0\' TERM\nkill -TERM "$PPID"\nwhile :; do sleep 0.1; done\n',
        )
        await chmod(executable, 0o755)

        const result = await runSetup({
          command: true,
          env: {
            PATH: `${directory}:${process.env.PATH}`,
          },
        })

        expect(result.exitCode).toBe(1)
        expect(result.stdout).toContain('CONTAINER_STOPPED')
        expect(result.stdout).not.toContain('shutdown timed out')
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it('migrates SQLite and preserves edited records and credentials on repeated setup', async () => {
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

      const database = new Database(filename)

      database.run("UPDATE authors SET name = 'Edited author' WHERE id = 1")
      database.run(
        "UPDATE books SET title = 'Edited book', price = 100 WHERE id = 1",
      )
      database.run("UPDATE news SET title = 'Edited news' WHERE id = 1")
      database.run(
        "UPDATE users SET email = upper(email), first_name = 'Edited admin'",
      )
      database.close()

      const snapshot = snapshotSqlite(filename)
      const repeated = await runSetup({
        env: {
          DB_SQLITE_FILE: filename,
          ADMIN_PASSWORD: 'a-different-configured-password',
        },
      })

      expect(repeated.exitCode).toBe(0)
      expect(repeated.stdout).toContain('Database setup completed')
      expect(repeated.stdout).toContain('"inserted":0')
      expect(snapshotSqlite(filename)).toEqual(snapshot)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('resumes SQLite setup after an interrupted seed without replacing existing authors', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bookshop-setup-retry-'))
    const filename = join(directory, 'db.sqlite')
    const preload = join(directory, 'preload.ts')

    try {
      await Bun.write(
        preload,
        `
        import { mock } from 'bun:test'
        const { seedAuthors } = await import(${JSON.stringify(authorsSeedUrl)})
        await mock.module(${JSON.stringify(seedsUrl)}, () => ({
          seedAuthors,
          seedBooks: async () => { throw new Error('Interrupted after authors') },
          seedNews: async () => ({}),
          seedUsers: async () => ({}),
        }))
      `,
      )

      const failed = await runSetup({
        preload,
        env: { DB_SQLITE_FILE: filename },
      })

      expect(failed.exitCode).toBe(1)
      expect(readSeededData(filename)).toEqual({
        authors: { total: authorsData.length },
        books: { total: 0 },
        news: { total: 0 },
        users: [],
      })

      const database = new Database(filename)

      database.run(
        "UPDATE authors SET name = 'Preserved after failure' WHERE id = 1",
      )
      database.close()

      const recovered = await runSetup({ env: { DB_SQLITE_FILE: filename } })

      expect(recovered.exitCode).toBe(0)
      expect(readSeededData(filename).books).toEqual({
        total: booksData.length,
      })
      expect(readSeededData(filename).news).toEqual({ total: newsData.length })
      expect(readSeededData(filename).users).toHaveLength(1)
      expect(snapshotSqlite(filename)[0]).toContainEqual(
        expect.objectContaining({
          id: 1,
          name: 'Preserved after failure',
        }),
      )
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['non-admin', 'deleted'])(
    'rejects an existing SQLite %s account without changing it',
    async (scenario) => {
      const directory = await mkdtemp(
        join(tmpdir(), 'bookshop-setup-conflict-'),
      )
      const filename = join(directory, 'db.sqlite')

      try {
        expect(
          (await runSetup({ env: { DB_SQLITE_FILE: filename } })).exitCode,
        ).toBe(0)

        const database = new Database(filename)

        if (scenario === 'non-admin') {
          database.run("UPDATE users SET role = 'user'")
        } else {
          database.run('UPDATE users SET deleted_at = 123456')
        }

        database.close()

        const snapshot = snapshotSqlite(filename)
        const result = await runSetup({ env: { DB_SQLITE_FILE: filename } })

        expect(result.exitCode).toBe(1)
        expect(result.stdout).toContain(
          'ADMIN_EMAIL belongs to an existing non-admin or deleted account',
        )
        expect(snapshotSqlite(filename)).toEqual(snapshot)
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

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

async function withMongoDatabase(
  run: (uri: string, database: mongoose.mongo.Db) => Promise<void>,
) {
  const uri = new URL(Bun.env.SETUP_TEST_MONGO_URL!)
  const name = `bookshop_setup_test_${crypto.randomUUID().replaceAll('-', '')}`
  uri.pathname = `/${name}`
  const client = new mongoose.mongo.MongoClient(uri.toString())

  try {
    await client.connect()
    await run(uri.toString(), client.db(name))
  } finally {
    try {
      await client.db(name).dropDatabase()
    } finally {
      await client.close()
    }
  }
}

async function snapshotMongo(database: mongoose.mongo.Db) {
  return Promise.all(
    ['authors', 'books', 'news', 'users'].map((collection) =>
      database.collection(collection).find().sort({ id: 1 }).toArray(),
    ),
  )
}

// Opt in with a disposable replica set; never use the application's DB_MONGO_URL.
describe.skipIf(!Bun.env.SETUP_TEST_MONGO_URL)(
  'MongoDB setup integration',
  () => {
    it('preserves edited documents, credentials, references and counters on reruns', async () => {
      await withMongoDatabase(async (uri, database) => {
        const env = { DB_REPO: 'MONGO', DB_MONGO_URL: uri }
        const counters = database.collection<{ _id: string; seq: number }>(
          'counters',
        )
        const first = await runSetup({ command: true, env })

        expect({ exitCode: first.exitCode, stderr: first.stderr }).toEqual({
          exitCode: 0,
          stderr: '',
        })
        expect(await database.collection('authors').countDocuments()).toBe(
          authorsData.length,
        )
        expect(await database.collection('books').countDocuments()).toBe(
          booksData.length,
        )
        expect(await database.collection('news').countDocuments()).toBe(
          newsData.length,
        )
        expect(await database.collection('users').countDocuments()).toBe(1)

        for (const book of await database
          .collection('books')
          .find()
          .toArray()) {
          const seed = booksData.find((record) => record.id === book.id)!
          const author = await database
            .collection('authors')
            .findOne({ id: seed.author })

          expect(book.authorId).toEqual(author!._id)
        }

        await database
          .collection('authors')
          .updateOne({ id: 1 }, { $set: { name: 'Edited author' } })
        await database
          .collection('books')
          .updateOne({ id: 1 }, { $set: { title: 'Edited book', price: 100 } })
        await database
          .collection('news')
          .updateOne({ id: 1 }, { $set: { title: 'Edited news' } })
        await database.collection('users').updateOne(
          {},
          {
            $set: { email: 'SETUP@example.test', firstName: 'Edited admin' },
          },
        )
        await counters.updateMany({}, { $set: { seq: 5000 } })

        const snapshot = await snapshotMongo(database)
        const repeated = await runSetup({
          env: { ...env, ADMIN_PASSWORD: 'changed-config-password' },
        })

        expect(repeated.exitCode).toBe(0)
        expect(repeated.stdout).toContain('inserted: 0')
        expect(await snapshotMongo(database)).toEqual(snapshot)
        expect(
          (await counters.find().toArray()).every(
            (counter) => counter.seq === 5000,
          ),
        ).toBe(true)

        // An existing custom book must keep ID allocation above the seed range.
        const book = await database.collection('books').findOne({ id: 1 })
        const { _id, ...customBook } = book!

        await database
          .collection('books')
          .insertOne({ ...customBook, id: 6000 })
        await counters.updateOne({ _id: 'Book' }, { $set: { seq: 0 } })
        expect((await runSetup({ env })).exitCode).toBe(0)
        expect((await counters.findOne({ _id: 'Book' }))?.seq).toBe(6000)

        await database
          .collection('users')
          .updateOne({}, { $set: { id: 7000, email: 'other@example.test' } })
        await counters.deleteOne({ _id: 'User' })
        expect((await runSetup({ env })).exitCode).toBe(0)
        expect(
          (
            await database
              .collection('users')
              .findOne({ email: 'setup@example.test' })
          )?.id,
        ).toBe(7001)
      })
    }, 30_000)

    it('recovers a partially seeded MongoDB database and missing counters', async () => {
      await withMongoDatabase(async (uri, database) => {
        const author = { ...authorsData[0]!, name: 'Preserved partial author' }

        await database.collection('authors').insertOne(author)
        const result = await runSetup({
          env: { DB_REPO: 'MONGO', DB_MONGO_URL: uri },
        })

        expect(result.exitCode).toBe(0)
        expect(await database.collection('authors').countDocuments()).toBe(
          authorsData.length,
        )
        expect(await database.collection('books').countDocuments()).toBe(
          booksData.length,
        )
        expect(await database.collection('news').countDocuments()).toBe(
          newsData.length,
        )
        expect(await database.collection('users').countDocuments()).toBe(1)
        expect(
          (await database.collection('authors').findOne({ id: author.id }))
            ?.name,
        ).toBe(author.name)
        expect(
          (
            await database
              .collection<{ _id: string; seq: number }>('counters')
              .findOne({ _id: 'Author' })
          )?.seq,
        ).toBe(Math.max(...authorsData.map((record) => record.id)))
      })
    }, 15_000)

    it.each(['non-admin', 'deleted'])(
      'rejects an existing MongoDB %s account without changing it',
      async (scenario) => {
        await withMongoDatabase(async (uri, database) => {
          const env = { DB_REPO: 'MONGO', DB_MONGO_URL: uri }

          expect((await runSetup({ env })).exitCode).toBe(0)

          await database.collection('users').updateOne(
            {},
            {
              $set:
                scenario === 'non-admin'
                  ? { role: 'user' }
                  : { deletedAt: new Date() },
            },
          )

          const snapshot = await snapshotMongo(database)
          const result = await runSetup({ env })

          expect(result.exitCode).toBe(1)
          expect(result.stdout).toContain(
            'ADMIN_EMAIL belongs to an existing non-admin or deleted account',
          )
          expect(await snapshotMongo(database)).toEqual(snapshot)
        })
      },
      15_000,
    )
  },
)
