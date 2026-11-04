import type { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import mongoose from 'mongoose'
import { validateDatabaseEnv } from '@/config/validateEnv'
import {
  DatabaseStartupError,
  databaseStartupError,
  validateMongoUrl,
} from '@/utils/databaseConnection.utils'
import { log } from '@/libs/logger'
import { databasePolicy } from '@/constants/database'
import { env } from './config'
import { DB_REPO } from './types/enums'

export let sqliteClient: Database | undefined
export let sqlite: BunSQLiteDatabase
let connected = false
let connecting: Promise<void> | undefined
let schemaReady = false
let monitoring = false

/** Entrypoints own connections; importing application code performs no network I/O. */
export async function connectDatabase(): Promise<void> {
  validateDatabaseEnv()
  if (connected) {
    return
  }

  connecting ??= (async () => {
    try {
      await initializeDatabase()
      connected = true
    } catch (error) {
      await disposeDatabase().catch(() => undefined)

      throw databaseStartupError(error, env.dbRepo, 'connection')
    }
  })()

  const attempt = connecting
  try {
    await attempt
  } finally {
    if (connecting === attempt) {
      connecting = undefined
    }
  }
}

async function initializeDatabase(): Promise<void> {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { drizzle } = await import('drizzle-orm/bun-sqlite')
    const { Database } = await import('bun:sqlite')

    if (env.dbSqliteFile !== ':memory:') {
      await mkdir(dirname(resolve(env.dbSqliteFile)), { recursive: true })
    }

    sqliteClient = new Database(env.dbSqliteFile)
    sqliteClient.run(
      `PRAGMA journal_mode = WAL; PRAGMA busy_timeout = ${databasePolicy.sqliteBusyTimeoutMs}; PRAGMA foreign_keys = ON`,
    )
    sqlite = drizzle({ client: sqliteClient, casing: 'snake_case' })
  } else {
    if (!env.dbMongoUrl) {
      throw new DatabaseStartupError('MongoDB requires DB_MONGO_URL')
    }

    validateMongoUrl(env.dbMongoUrl)

    await mongoose.connect(env.dbMongoUrl, {
      serverSelectionTimeoutMS: databasePolicy.mongoSelectionTimeoutMs,
      socketTimeoutMS: databasePolicy.mongoSocketTimeoutMs,
    })
    const mongoDb = mongoose.connection.db

    if (!mongoDb) {
      throw new DatabaseStartupError('MongoDB connection is not initialized')
    }

    const hello = await mongoDb.admin().command({ hello: 1 })

    if (!hello.setName) {
      throw new DatabaseStartupError(
        'MongoDB requires a replica set for transactional email outbox writes',
      )
    }

    if (!monitoring) {
      mongoose.connection.on('error', (error: unknown) => {
        if (connected) {
          log.error('MongoDB connection error', {
            error: databaseStartupError(error, env.dbRepo, 'runtime'),
          })
        }
      })
      mongoose.connection.on('disconnected', () => {
        if (connected) {
          log.warn(
            'MongoDB disconnected; readiness is unavailable until reconnection',
          )
        }
      })
      monitoring = true
    }

    const {
      AuthorModel,
      BookModel,
      UserModel,
      OrderModel,
      NewsModel,
      EmailOutboxModel,
      TermsDocumentModel,
    } = await import('./models/mongo')

    try {
      await Promise.all([
        AuthorModel.init(),
        BookModel.init(),
        UserModel.init(),
        OrderModel.init(),
        NewsModel.init(),
        EmailOutboxModel.init(),
        TermsDocumentModel.init(),
        mongoose.model('Counter').init(),
      ])
    } catch (error) {
      throw databaseStartupError(error, env.dbRepo, 'schema')
    }
  }
}

export async function assertDatabaseSchema(): Promise<void> {
  schemaReady = false
  if (!connected) {
    throw new DatabaseStartupError('Database is not connected')
  }

  if (env.dbRepo === DB_REPO.SQLITE) {
    const schema = await import('./models/sqlite')
    const { getTableColumns, getTableName } = await import('drizzle-orm')
    const missing: string[] = []
    for (const table of Object.values(schema)) {
      const name = getTableName(table)
      const columns = sqliteClient!
        .query<{ name: string }, [string]>(
          'SELECT name FROM pragma_table_info(?)',
        )
        .all(name)
      if (columns.length === 0) {
        missing.push(name)
        continue
      }
      const requiredColumns = Object.values(getTableColumns(table)) as {
        name: string
      }[]
      for (const column of requiredColumns) {
        if (!columns.some((existing) => existing.name === column.name)) {
          missing.push(`${name}.${column.name}`)
        }
      }
    }
    if (missing.length > 0) {
      throw new DatabaseStartupError(
        `SQLite schema is incomplete (${missing.join(', ')}). Run npm run setup for a fresh demo database, or npm run migrate before seeding.`,
      )
    }
  }

  schemaReady = true
}

export function isDatabaseReady(): boolean {
  if (!connected || !schemaReady) {
    return false
  }
  if (env.dbRepo === DB_REPO.MONGO) {
    return mongoose.connection.readyState === mongoose.STATES.connected
  }
  try {
    sqliteClient!.query('SELECT 1').get()

    return true
  } catch {
    return false
  }
}

async function disposeDatabase(): Promise<void> {
  connected = false
  schemaReady = false
  const client = sqliteClient
  sqliteClient = undefined
  client?.close()
  if (env.dbRepo === DB_REPO.MONGO) {
    await mongoose.connection.close()
  }
}

export async function closeDatabase(): Promise<void> {
  await connecting?.catch(() => undefined)
  await disposeDatabase()
}
