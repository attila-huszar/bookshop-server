import type { Database } from 'bun:sqlite'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import type { Mongoose } from 'mongoose'
import { env } from './config'
import { DB_REPO } from './constants'

let sqliteClient: Database | undefined
let sqlite: BunSQLiteDatabase
let mongo: Mongoose

if (env.dbRepo === DB_REPO.SQLITE) {
  try {
    const { drizzle } = await import('drizzle-orm/bun-sqlite')
    const { Database } = await import('bun:sqlite')

    sqliteClient = new Database(env.dbSqliteFile)

    sqlite = drizzle({
      client: sqliteClient,
      casing: 'snake_case',
    })
  } catch (error) {
    console.error('Error connecting to SQLite:', error)
    process.exit(1)
  }
}

if (env.dbRepo === DB_REPO.MONGO) {
  try {
    const mongoose = await import('mongoose')
    mongo = await mongoose.connect(env.dbMongoUrl)
  } catch (error) {
    console.error('Error connecting to MongoDB:', error)
    process.exit(1)
  }
}

export { sqliteClient, sqlite, mongo }
