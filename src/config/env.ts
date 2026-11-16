import { parseMongoURI } from '@/utils/db.utils'
import { authTiming } from '@/constants/auth'
import { backupRetentionPolicy } from '@/constants/backup'
import { DB_REPO, MongoBackupMode } from '@/types/enums'

const rawDbRepo = Bun.env.DB_REPO ?? DB_REPO.MONGO
const rawMongoBackupMode = Bun.env.MONGO_BACKUP_MODE ?? MongoBackupMode.Logical
const rawBackupRetention = Bun.env.BACKUP_RETENTION

export const env = {
  adminEmail: Bun.env.ADMIN_EMAIL,
  adminPassword: Bun.env.ADMIN_PASSWORD,

  mailerService: Bun.env.MAILER_SERVICE ?? 'gmail',
  mailerHost: Bun.env.MAILER_HOST ?? 'smtp.gmail.com',
  mailerPort: Bun.env.MAILER_PORT ?? '465',
  mailerSecure: Bun.env.MAILER_SECURE ?? 'true',
  mailerName: Bun.env.MAILER_NAME ?? 'Bookshop',
  mailerUser: Bun.env.MAILER_USER,
  mailerPass: Bun.env.MAILER_PASS,

  serverBaseUrl: Bun.env.SERVER_BASE_URL ?? 'http://localhost',
  clientBaseUrl: Bun.env.CLIENT_BASE_URL,
  googleClientId: Bun.env.GOOGLE_CLIENT_ID,
  port: Bun.env.PORT ?? '5000',

  cookieSecret: Bun.env.COOKIE_SECRET,
  cookieMaxAge:
    Bun.env.COOKIE_MAX_AGE ?? String(authTiming.cookieMaxAgeSeconds),

  // Parse on access so configuration failures stay inside managed startup.
  get dbRepo(): DB_REPO {
    return parseEnum('DB_REPO', rawDbRepo, [DB_REPO.SQLITE, DB_REPO.MONGO])
  },
  dbSqliteFile: Bun.env.DB_SQLITE_FILE ?? 'data/db.sqlite',
  dbMongoUrl: Bun.env.DB_MONGO_URL,
  get databaseNamespace(): string {
    if (this.dbRepo === DB_REPO.SQLITE) {
      return 'sqlite'
    }

    const { database } = parseMongoURI(this.dbMongoUrl ?? '')

    if (!database) {
      throw new Error('DB_MONGO_URL must include an explicit database name')
    }

    return `mongo/${encodeURIComponent(database)}`
  },
  databaseCoordinationDirectory: Bun.env.BOOKSHOP_DATABASE_COORDINATION_DIR,
  get mongoBackupMode(): MongoBackupMode {
    return parseEnum('MONGO_BACKUP_MODE', rawMongoBackupMode, [
      MongoBackupMode.Logical,
      MongoBackupMode.Oplog,
    ])
  },

  get backupRetention(): { daily: number; weekly: number; monthly: number } {
    const counts = (
      rawBackupRetention ??
      [
        backupRetentionPolicy.daily,
        backupRetentionPolicy.weekly,
        backupRetentionPolicy.monthly,
      ].join(',')
    )
      .split(',')
      .map((count) => count.trim())
    const retention = {
      daily: Number(counts[0]),
      weekly: Number(counts[1]),
      monthly: Number(counts[2]),
    }

    if (
      counts.length !== 3 ||
      counts.some((count) => !/^\d+$/.test(count)) ||
      Object.values(retention).some((count) => !Number.isSafeInteger(count)) ||
      retention.daily < 1
    ) {
      throw new Error(
        'BACKUP_RETENTION must be daily,weekly,monthly integer counts (daily >= 1; weekly and monthly >= 0)',
      )
    }

    return retention
  },
  backupRetentionDryRun: Bun.env.BACKUP_RETENTION_DRY_RUN === 'true',

  jwtAccessSecret: Bun.env.ACCESS_TOKEN_SECRET,
  jwtRefreshSecret: Bun.env.REFRESH_TOKEN_SECRET,
  jwtAccessExpiration:
    Bun.env.ACCESS_TOKEN_EXPIRATION ?? String(authTiming.accessTokenSeconds),
  jwtRefreshExpiration:
    Bun.env.REFRESH_TOKEN_EXPIRATION ?? String(authTiming.refreshTokenSeconds),

  ngrokAuthToken: Bun.env.NGROK_AUTHTOKEN ?? '',
  ngrokDomain: Bun.env.NGROK_DOMAIN ?? '',

  stripeSecret: Bun.env.STRIPE_SECRET,
  stripeWebhookSecret: Bun.env.STRIPE_WEBHOOK_SECRET,

  awsAccessKeyId: Bun.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: Bun.env.AWS_SECRET_ACCESS_KEY,
  awsRegion: Bun.env.AWS_REGION,
  awsBucket: Bun.env.AWS_BUCKET,

  redisUrl: Bun.env.REDIS_URL,
}

function parseEnum<T extends string>(
  name: string,
  value: string,
  choices: readonly T[],
): T {
  const match = choices.find((choice) => choice === value)

  if (match === undefined) {
    throw new Error(`Invalid ${name}: expected ${choices.join(' or ')}`)
  }

  return match
}
