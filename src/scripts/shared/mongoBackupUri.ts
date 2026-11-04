import { Resolver } from 'node:dns/promises'
import { getMongoUriOption, parseMongoURI } from '@/utils/db.utils'
import { backupTiming } from '@/constants/backup'

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
    records = lookup
      ? await lookup(hostname)
      : await resolver.resolveTxt(hostname)
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

  const source = getMongoUriOption(
    new URLSearchParams(records[0]?.join('') ?? ''),
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
  let connection: ReturnType<typeof parseMongoURI>

  try {
    connection = parseMongoURI(input.uri)
  } catch {
    // Parser errors can contain credentials; do not include their cause.
    throw new Error('Mongo backups require a valid DB_MONGO_URL')
  }

  const database = connection.database

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
  const mechanism = getMongoUriOption(options, 'authMechanism') ?? ''
  const hasCredentials = Boolean(connection.username) || Boolean(mechanism)
  const needsAuthSource =
    getMongoUriOption(options, 'authSource') === null &&
    hasCredentials &&
    !externalAuthMechanisms.has(mechanism)

  if (needsAuthSource) {
    const source = connection.isSRV
      ? await resolveAuthSource(connection.hosts[0]!, input.resolveTxt)
      : undefined

    options.set('authSource', source ?? database)
  }

  const query = options.toString()

  return query ? `${connection.baseUri}/?${query}` : `${connection.baseUri}/`
}
