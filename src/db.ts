import mongoose from 'mongoose'
import { Database } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { env } from './config'
import { DB_REPO } from './constants'

let sqlite: ReturnType<typeof drizzle>
let mongo: typeof mongoose

if (env.dbRepo === DB_REPO.SQLITE) {
  try {
    sqlite = drizzle({
      client: new Database(env.dbSqliteFile),
      casing: 'snake_case',
    })
  } catch (error) {
    console.error('Error connecting to SQLite:', error)
    process.exit(1)
  }
}

if (env.dbRepo === DB_REPO.MONGO) {
  try {
    mongo = await mongoose.connect(env.dbMongoUrl)
  } catch (error) {
    console.error('Error connecting to MongoDB:', error)
    process.exit(1)
  }
}

export { sqlite as db, mongo }
