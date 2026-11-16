import type { Database } from 'bun:sqlite'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite'
import { env } from '@/config/env'
import { DatabaseStartupError } from '@/utils/db.utils'
import { databasePolicy } from '@/constants/database'

export let sqliteClient: Database | undefined
export let sqlite: BunSQLiteDatabase

export async function connect(): Promise<void> {
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
}

export async function assertSchema(): Promise<void> {
  const schema = await import('@/models/sqlite')
  const { getTableColumns, getTableName } = await import('drizzle-orm')
  const missing: string[] = []

  for (const table of Object.values(schema)) {
    const tableName = getTableName(table)
    const existingColumns = sqliteClient!
      .query<{ name: string }, [string]>(
        'SELECT name FROM pragma_table_info(?)',
      )
      .all(tableName)

    if (existingColumns.length === 0) {
      missing.push(tableName)
      continue
    }

    const requiredColumns = Object.values(getTableColumns(table)) as {
      name: string
    }[]

    for (const column of requiredColumns) {
      if (!existingColumns.some((existing) => existing.name === column.name)) {
        missing.push(`${tableName}.${column.name}`)
      }
    }
  }

  if (missing.length > 0) {
    throw new DatabaseStartupError(
      `SQLite schema is incomplete (${missing.join(', ')}). Set DB_REPO=SQLITE and run npm run setup to initialize the Docker database.`,
    )
  }
}

export function isReady(): boolean {
  if (!sqliteClient) {
    return false
  }

  try {
    sqliteClient.query('SELECT 1').get()

    return true
  } catch {
    return false
  }
}

export function close(): void {
  const client = sqliteClient
  sqliteClient = undefined

  client?.close()
}
