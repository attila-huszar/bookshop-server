import { Resolver } from 'node:dns/promises'
import { getMongoUriOption, parseMongoURI } from '@/utils/db.utils'
import { backupTiming } from '@/constants/backup'

type MongoOplogUriInput = {
  uri: string
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
  lookup?: MongoOplogUriInput['resolveTxt'],
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
    const isMissingTxtRecord =
      error instanceof Error &&
      'code' in error &&
      (error.code === 'ENODATA' || error.code === 'ENOTFOUND')

    if (isMissingTxtRecord) {
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

export async function getMongoOplogUri(
  input: MongoOplogUriInput,
): Promise<string> {
  let connection: ReturnType<typeof parseMongoURI>

  try {
    connection = parseMongoURI(input.uri)
  } catch {
    // Parser errors can contain credentials; do not include their cause.
    throw new Error('Mongo backups require a valid DB_MONGO_URL')
  }

  const database = connection.database

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
