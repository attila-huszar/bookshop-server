import { validateMongoUrl } from '@/utils/db.utils'
import { DB_REPO } from '@/types/enums'
import { env } from './env'

export type ProcessRole = 'api' | 'worker' | 'maintenance' | 'backup' | 'setup'

const storageKeys = [
  'awsAccessKeyId',
  'awsSecretAccessKey',
  'awsRegion',
  'awsBucket',
] as const
const requiredKeys: Record<ProcessRole, readonly (keyof typeof env)[]> = {
  api: [
    'clientBaseUrl',
    'cookieSecret',
    'jwtAccessSecret',
    'jwtRefreshSecret',
    'stripeSecret',
    'stripeWebhookSecret',
    ...storageKeys,
  ],
  worker: ['redisUrl', 'mailerUser', 'mailerPass'],
  maintenance: ['stripeSecret', ...storageKeys],
  backup: storageKeys,
  setup: ['adminEmail', 'adminPassword'],
}

export function validateDatabaseEnv(): void {
  if (env.dbRepo !== DB_REPO.SQLITE && env.dbRepo !== DB_REPO.MONGO) {
    throw new Error('Invalid DB_REPO: expected SQLITE or MONGO')
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    if (!env.dbMongoUrl) {
      throw new Error('MongoDB requires DB_MONGO_URL')
    }
    validateMongoUrl(env.dbMongoUrl)
  } else if (!env.dbSqliteFile.trim()) {
    throw new Error('DB_SQLITE_FILE must not be empty')
  }
}

export function validateEnv(role: ProcessRole): typeof env {
  validateDatabaseEnv()
  const missing = requiredKeys[role].filter((key) => !env[key])
  if (missing.length > 0) {
    const fields = missing.map((key) => {
      if (key === 'jwtAccessSecret') {
        return 'ACCESS_TOKEN_SECRET'
      }
      if (key === 'jwtRefreshSecret') {
        return 'REFRESH_TOKEN_SECRET'
      }

      return key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()
    })
    throw new Error(
      `Missing required ${role} configuration: ${fields.join(', ')}. Check .env.`,
    )
  }
  if (role === 'api' && (!/^\d+$/.test(env.port) || Number(env.port) > 65535)) {
    throw new Error('PORT must be an integer between 0 and 65535')
  }
  if (
    role === 'worker' &&
    (!/^\d+$/.test(env.mailerPort) ||
      Number(env.mailerPort) < 1 ||
      Number(env.mailerPort) > 65535)
  ) {
    throw new Error('MAILER_PORT must be an integer between 1 and 65535')
  }
  if (role === 'backup') {
    if (
      env.dbRepo === DB_REPO.MONGO &&
      !['logical', 'oplog'].includes(env.mongoBackupMode)
    ) {
      throw new Error('Invalid MONGO_BACKUP_MODE: expected logical or oplog')
    }
    if (
      !['true', 'false'].includes(Bun.env.BACKUP_RETENTION_DRY_RUN ?? 'false')
    ) {
      throw new Error('BACKUP_RETENTION_DRY_RUN must be true or false')
    }
  }
  return env
}
