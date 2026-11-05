import { DB_REPO } from '@/types/enums'
import { getErrorCode } from './error.utils'

type ParsedMongoURI = {
  baseUri: string
  isSRV: boolean
  username?: string
  hosts: string[]
  database: string
  searchParams: URLSearchParams
}

const mongoUriPattern =
  /^(mongodb(?:\+srv)?):\/\/([^/?#]+)(?:\/([^?#]*))?(?:\?([^#]*))?$/

export function parseMongoURI(uri: string): ParsedMongoURI {
  try {
    const match = mongoUriPattern.exec(uri)

    if (!match || /[\s\\\p{Cc}]/u.test(uri)) {
      throw new Error('Invalid MongoDB URI syntax')
    }

    // URLSearchParams tolerates malformed escapes; configuration must not.
    decodeURIComponent(uri)

    const [, protocol = '', authority = '', path = '', query = ''] = match
    const isSRV = protocol === 'mongodb+srv'
    const credentialSeparator = authority.lastIndexOf('@')
    const username =
      credentialSeparator === -1
        ? undefined
        : parseUsername(authority.slice(0, credentialSeparator))

    const hosts = authority.slice(credentialSeparator + 1).split(',')

    if (isSRV && hosts.length !== 1) {
      throw new Error('MongoDB SRV requires a single host')
    }

    for (const host of hosts) {
      validateHost(host, isSRV)
    }

    const database = decodeURIComponent(path)

    if (/[/\\\0]/.test(database)) {
      throw new Error('Invalid MongoDB database path')
    }

    return {
      // Preserve the original authority, including encoded credentials and hosts.
      baseUri: `${protocol}://${authority}`,
      isSRV,
      username,
      hosts,
      database,
      searchParams: new URLSearchParams(query),
    }
  } catch {
    // Native parsing errors may include the input URI and its credentials.
    throw new Error('Invalid MongoDB connection string')
  }
}

function parseUsername(credentials: string): string {
  const parts = credentials.split(':')
  const [encodedUsername = '', encodedPassword = ''] = parts

  if (!encodedUsername || parts.length > 2 || /[@[\]$]/.test(credentials)) {
    throw new Error('Invalid MongoDB credentials')
  }

  const username = decodeURIComponent(encodedUsername)
  const password = decodeURIComponent(encodedPassword)

  if (username.includes('\0') || password.includes('\0')) {
    throw new Error('Invalid MongoDB credentials')
  }

  return username
}

function validateHost(host: string, isSRV: boolean): void {
  const decoded = decodeURIComponent(host)

  if (!isSRV && decoded.startsWith('/') && decoded.endsWith('.sock')) {
    if (decoded.includes('\0')) {
      throw new Error('Invalid MongoDB socket path')
    }

    return
  }

  const match = /^(\[[^\]]+\]|[^:[\]]+)(?::([0-9]+))?$/.exec(host)

  if (!match) {
    throw new Error('Invalid MongoDB host')
  }

  const [, hostname = '', port] = match

  if (isSRV && (port !== undefined || hostname.startsWith('['))) {
    throw new Error('Invalid MongoDB SRV host')
  }

  // Use a special URL scheme so the native parser validates IPv6 and ports.
  // Keep the original host for serialization, including its encoded form.
  new URL(`http://${host}`)

  if (port && Number(port) === 0) {
    throw new Error('Invalid MongoDB port')
  }
}

export function getMongoUriOption(
  options: URLSearchParams,
  name: string,
): string | null {
  const normalized = name.toLowerCase()

  for (const [key, value] of options) {
    if (key.toLowerCase() === normalized) {
      return value
    }
  }

  return null
}

export class DatabaseStartupError extends Error {
  override name = 'DatabaseStartupError'
  code?: string | number
  stage?: string
  originalName?: string
}

export function validateMongoUrl(uri: string): void {
  try {
    const decoded = decodeURIComponent(uri)

    if (
      /<(?:db[_-]?password|password|username|user|cluster[^>]*)>/i.test(decoded)
    ) {
      throw new DatabaseStartupError(
        'DB_MONGO_URL still contains a placeholder. Replace the Atlas username/password placeholders in .env and percent-encode special characters.',
      )
    }

    parseMongoURI(uri)
  } catch (error) {
    if (error instanceof DatabaseStartupError) {
      throw error
    }

    throw new DatabaseStartupError(
      'Invalid DB_MONGO_URL. Use a mongodb:// or mongodb+srv:// URI and percent-encode special characters in credentials.',
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
