import { env } from './config'
import { DB_REPO } from './constants'

let sqlite: unknown
let mongo: unknown

if (env.dbRepo === DB_REPO.SQLITE) {
  try {
    const { drizzle } = await import('drizzle-orm/bun-sqlite')
    const { Database } = await import('bun:sqlite')

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
    const mongoose = await import('mongoose')
    mongo = await mongoose.connect(env.dbMongoUrl)
  } catch (error) {
    console.error('Error connecting to MongoDB:', error)
    process.exit(1)
  }
}

export { sqlite as db, mongo }
