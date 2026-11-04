import { env } from '@/config/env'
import { validateDatabaseEnv } from '@/config/validateEnv'
import { DatabaseStartupError, databaseStartupError } from '@/utils/db.utils'
import { DB_REPO } from '@/types/enums'

type DatabaseAdapter = {
  connect: () => Promise<void>
  assertSchema?: () => Promise<void>
  isReady: () => boolean
  close: () => void | Promise<void>
}

let adapter: DatabaseAdapter | undefined
let connected = false
let connecting: Promise<void> | undefined
let schemaReady = false

/** Entrypoints own connections; importing application code performs no network I/O. */
export async function connectDatabase(): Promise<void> {
  validateDatabaseEnv()

  if (connected) {
    return
  }

  connecting ??= initializeDatabase()
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
  try {
    adapter ??=
      env.dbRepo === DB_REPO.SQLITE
        ? await import('./database/sqlite')
        : await import('./database/mongo')

    await adapter.connect()
    connected = true
  } catch (error) {
    await disposeDatabase().catch(() => undefined)

    throw databaseStartupError(error, env.dbRepo, 'connection')
  }
}

export async function assertDatabaseSchema(): Promise<void> {
  schemaReady = false

  if (!connected || !adapter) {
    throw new DatabaseStartupError('Database is not connected')
  }

  await adapter.assertSchema?.()
  schemaReady = true
}

export function isDatabaseReady(): boolean {
  return connected && schemaReady && (adapter?.isReady() ?? false)
}

async function disposeDatabase(): Promise<void> {
  connected = false
  schemaReady = false

  await adapter?.close()
}

export async function closeDatabase(): Promise<void> {
  await connecting?.catch(() => undefined)
  await disposeDatabase()
}
