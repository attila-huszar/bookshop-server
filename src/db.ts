import type { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import mongoose from 'mongoose'
import { env } from './config'
import { DB_REPO } from './types/enums'

export let sqliteClient: Database | undefined
export let sqlite: BunSQLiteDatabase
let connected = false

/** Entrypoints own connections; importing application code performs no network I/O. */
export async function connectDatabase(): Promise<void> {
  if (connected) {
    return
  }

  if (env.dbRepo === DB_REPO.SQLITE) {
    const { drizzle } = await import('drizzle-orm/bun-sqlite')
    const { Database } = await import('bun:sqlite')

    if (env.dbSqliteFile !== ':memory:') {
      await mkdir(dirname(resolve(env.dbSqliteFile)), { recursive: true })
    }

    sqliteClient = new Database(env.dbSqliteFile)
    sqliteClient.run(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON',
    )
    sqlite = drizzle({ client: sqliteClient, casing: 'snake_case' })
  } else {
    await mongoose.connect(env.dbMongoUrl, {
      serverSelectionTimeoutMS: 10_000,
      socketTimeoutMS: 10_000,
    })
    const mongoDb = mongoose.connection.db

    if (!mongoDb) {
      throw new Error('MongoDB connection is not initialized')
    }

    const hello = await mongoDb.admin().command({ hello: 1 })

    if (!hello.setName) {
      throw new Error(
        'MongoDB requires a replica set for transactional email outbox writes',
      )
    }

    const {
      AuthorModel,
      BookModel,
      UserModel,
      OrderModel,
      NewsModel,
      EmailOutboxModel,
    } = await import('./models/mongo')

    await Promise.all([
      AuthorModel.init(),
      BookModel.init(),
      UserModel.init(),
      OrderModel.init(),
      NewsModel.init(),
      EmailOutboxModel.init(),
      mongoose.model('Counter').init(),
    ])
  }

  connected = true
}

export async function closeDatabase(): Promise<void> {
  if (sqliteClient) {
    sqliteClient.close()
    sqliteClient = undefined
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    await mongoose.connection.close()
  }

  connected = false
}
