import { DB_REPO } from '@/types/enums'
import { getErrorCode } from './error.utils'

// Use CommonJS to bypass the package's broken ESM wrapper in Bun.
const { ConnectionString } =
  require('mongodb-connection-string-url') as typeof import('mongodb-connection-string-url')

export class DatabaseStartupError extends Error {
  override name = 'DatabaseStartupError'
  code?: string | number
  stage?: string
  originalName?: string
}

export function validateMongoUrl(uri: string): void {
  let decoded: string

  try {
    new ConnectionString(uri)
    decoded = decodeURIComponent(uri)
  } catch {
    throw new DatabaseStartupError(
      'Invalid DB_MONGO_URL. Use a mongodb:// or mongodb+srv:// URI and percent-encode special characters in credentials.',
    )
  }

  if (
    /<(?:db[_-]?password|password|username|user|cluster[^>]*)>/i.test(decoded)
  ) {
    throw new DatabaseStartupError(
      'DB_MONGO_URL still contains a placeholder. Replace the Atlas username/password placeholders in .env and percent-encode special characters.',
    )
  }
}

export function databaseStartupError(
  error: unknown,
  dbRepo: DB_REPO,
  stage = 'initialization',
): DatabaseStartupError {
  if (error instanceof DatabaseStartupError) {
    return error
  }

  const codes = new Set<string>()
  const messages: string[] = []
  const seen = new Set<Error>()
  let current = error

  while (current instanceof Error && !seen.has(current)) {
    seen.add(current)
    codes.add(String(getErrorCode(current) ?? '').toUpperCase())
    messages.push(`${current.name} ${current.message}`.toLowerCase())
    current = current.cause
  }

  const message = messages.join(' ')
  let hint: string

  if (dbRepo === DB_REPO.MONGO) {
    if (codes.has('18') || /authentication failed|bad auth/.test(message)) {
      hint =
        'MongoDB authentication failed. Check the database username/password and authSource in DB_MONGO_URL; percent-encode special characters in credentials.'
    } else if (codes.has('13') || /not authorized|unauthorized/.test(message)) {
      hint =
        'MongoDB access was denied. Check that the database user has permissions to create collections/indexes and read/write the application database.'
    } else if (/tls|ssl|certificate/.test(message)) {
      hint =
        'MongoDB TLS connection failed. Check the certificate trust, system clock and TLS settings; keep certificate verification enabled.'
    } else if (
      codes.has('ENOTFOUND') ||
      codes.has('ENODATA') ||
      codes.has('EAI_AGAIN') ||
      /querysrv|querytxt|getaddrinfo/.test(message)
    ) {
      hint =
        'MongoDB DNS lookup failed. Check the hostname in DB_MONGO_URL, DNS access and whether the Atlas cluster is available.'
    } else if (/mongoparseerror|mongoinvalidargumenterror/.test(message)) {
      hint =
        'Invalid DB_MONGO_URL or MongoDB connection options. Check the URI and percent-encode special characters in credentials.'
    } else if (
      ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].some((code) =>
        codes.has(code),
      ) ||
      /serverselection|networkerror|timed? ?out/.test(message)
    ) {
      hint =
        'MongoDB is not reachable. Check Atlas Network Access for the host outgoing IP, cluster availability, firewall and DB_MONGO_URL.'
    } else {
      hint =
        'MongoDB initialization failed. Check DB_MONGO_URL, database permissions and the MongoDB server logs.'
    }
  } else if (
    codes.has('SQLITE_READONLY') ||
    codes.has('EACCES') ||
    codes.has('EPERM')
  ) {
    hint =
      'SQLite is not writable. Check ownership and permissions of DB_SQLITE_FILE, its parent directory and any WAL/shared-memory files; Docker processes use bun:bun.'
  } else if (
    codes.has('SQLITE_CANTOPEN') ||
    codes.has('ENOENT') ||
    codes.has('ENOTDIR')
  ) {
    hint =
      'SQLite could not open DB_SQLITE_FILE. Check the path, parent directory and Docker volume mount.'
  } else if (codes.has('SQLITE_BUSY') || codes.has('SQLITE_LOCKED')) {
    hint =
      'SQLite is locked. Check for another long-running transaction or database maintenance process and retry.'
  } else {
    hint =
      'SQLite initialization failed. Check DB_SQLITE_FILE and database integrity.'
  }

  // Keep safe diagnostics and original frames, never driver messages or causes.
  const failure = new DatabaseStartupError(hint)
  const rawCode = getErrorCode(error)
  if (
    typeof rawCode === 'number' ||
    (typeof rawCode === 'string' && /^[A-Z][A-Z0-9_]*$/.test(rawCode))
  ) {
    failure.code = rawCode
  }
  failure.stage = stage
  if (error instanceof Error) {
    failure.originalName = /^[A-Za-z]+Error$/.test(error.name)
      ? error.name
      : 'Error'
    const frames = error.stack
      ?.split('\n')
      .filter((line) => /^\s+at /.test(line))
      .join('\n')
    if (frames) {
      failure.stack = `${failure.name}: ${failure.message}\n${frames}`
    }
  }

  return failure
}
