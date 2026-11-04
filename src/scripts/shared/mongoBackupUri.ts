import { Resolver } from 'node:dns/promises'
import { createRequire } from 'node:module'
import type { ConnectionString as ParsedConnectionString } from 'mongodb-connection-string-url'
import { backupTiming } from '@/constants/backup'

// The package's ESM wrapper loses its exports in Bun; use its CJS entrypoint.
const { ConnectionString } = createRequire(import.meta.url)(
  'mongodb-connection-string-url',
) as typeof import('mongodb-connection-string-url')

export type MongoBackupMode = 'logical' | 'oplog'

type MongoBackupUriInput = {
  uri: string
  mode: MongoBackupMode
  resolveTxt?: (hostname: string) => Promise<readonly (readonly string[])[]>
}

const externalAuthMechanisms = new Set([
  'GSSAPI',
  'MONGODB-X509',
  'MONGODB-AWS',
  'MONGODB-OIDC',
])

async function resolveAuthSource(
  hostname: string,
  lookup?: MongoBackupUriInput['resolveTxt'],
): Promise<string | undefined> {
  let records: readonly (readonly string[])[]

  try {
    const resolver = new Resolver({
      timeout: backupTiming.connectionTimeoutMs,
      tries: 2,
    })
    records = await (lookup ?? ((host) => resolver.resolveTxt(host)))(hostname)
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENODATA' || error.code === 'ENOTFOUND')
    ) {
      return undefined
    }

    throw new Error(
      'Could not resolve MongoDB backup authentication settings',
      { cause: error },
    )
  }

  if (records.length > 1) {
    throw new Error('MongoDB backup URI has multiple DNS TXT records')
  }

  const source = new URLSearchParams(records[0]?.join('') ?? '').get(
    'authSource',
  )

  if (source === '') {
    throw new Error('MongoDB backup URI has an empty DNS authSource')
  }

  return source ?? undefined
}

export async function getMongoBackupUri(
  input: MongoBackupUriInput,
): Promise<string> {
  let connection: ParsedConnectionString
  let database: string

  try {
    connection = new ConnectionString(input.uri)
    database = decodeURIComponent(connection.pathname.slice(1))

    if (database.includes('/') || connection.hash) {
      throw new Error('Invalid database path')
    }
  } catch {
    // Parser errors can contain credentials; do not include their cause.
    throw new Error('Mongo backups require a valid DB_MONGO_URL')
  }

  if (input.mode === 'logical') {
    if (!database) {
      throw new Error(
        'Logical Mongo backups require DB_MONGO_URL with an explicit database path',
      )
    }

    return input.uri
  }

  if (!database) {
    return input.uri
  }

  const options = connection.searchParams
  const mechanism = options.get('authMechanism') ?? ''

  if (
    !options.has('authSource') &&
    (connection.username || mechanism) &&
    !externalAuthMechanisms.has(mechanism)
  ) {
    const source = connection.isSRV
      ? await resolveAuthSource(connection.hosts[0]!, input.resolveTxt)
      : undefined
    options.set('authSource', source ?? database)
  }

  connection.pathname = '/'

  return connection.toString()
}
