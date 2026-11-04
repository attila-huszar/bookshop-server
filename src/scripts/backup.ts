import { S3Client } from '@aws-sdk/client-s3'
import { env } from '@/config/env'
import { validateEnv } from '@/config/validateEnv'
import { type ProcessContext, runProcess } from '@/utils/process.utils'
import { log } from '@/libs/logger'
import { backupTiming } from '@/constants/backup'
import { processTiming } from '@/constants/process'
import { DB_REPO } from '@/types/enums'
import {
  type WithBackupArchive,
  withMongoArchive,
  withSqliteArchive,
} from './shared/backupArchive'
import { backupToStorage } from './shared/backupStorage'
import { createS3BackupStorage } from './shared/s3BackupStorage'

async function main(context: ProcessContext): Promise<void> {
  const backupType = env.dbRepo
  const label = backupType === DB_REPO.SQLITE ? 'SQLite' : 'Mongo'

  if (
    !env.awsBucket ||
    !env.awsRegion ||
    !env.awsAccessKeyId ||
    !env.awsSecretAccessKey
  ) {
    throw new Error(
      `${label} backups require the AWS S3 bucket, region and credentials`,
    )
  }

  validateEnv('backup')
  context.signal.throwIfAborted()

  const client = new S3Client({
    region: env.awsRegion,
    credentials: {
      accessKeyId: env.awsAccessKeyId,
      secretAccessKey: env.awsSecretAccessKey,
    },
    requestChecksumCalculation: 'WHEN_SUPPORTED',
    requestHandler: {
      connectionTimeout: backupTiming.connectionTimeoutMs,
      socketTimeout: backupTiming.socketTimeoutMs,
      requestTimeout: backupTiming.requestTimeoutMs,
      throwOnRequestTimeout: true,
    },
  })

  context.defer('S3 client', () => client.destroy())

  const withArchive: WithBackupArchive = (consume) => {
    if (backupType === DB_REPO.MONGO) {
      return withMongoArchive({
        uri: env.dbMongoUrl ?? '',
        mode: env.mongoBackupMode,
        consume,
        signal: context.signal,
      })
    }

    return withSqliteArchive({
      source: env.dbSqliteFile,
      consume,
      signal: context.signal,
    })
  }

  const storage = createS3BackupStorage({
    client,
    bucket: env.awsBucket,
    signal: context.signal,
  })

  const result = await backupToStorage({
    backupType,
    retention: {
      daily: Number(env.backupRetentionDaily),
      weekly: Number(env.backupRetentionWeekly),
      monthly: Number(env.backupRetentionMonthly),
    },
    dryRun: env.backupRetentionDryRun,
    withArchive,
    storage,
  })

  log.info(`${label} backup uploaded and verified`, {
    bucket: env.awsBucket,
    key: result.key,
    removedOldBackups: result.removed,
    retainedBackups: result.retained,
    prunableBackups: result.prunable.length,
    pruneCandidates: env.backupRetentionDryRun ? result.prunable : undefined,
    retentionDryRun: env.backupRetentionDryRun,
  })
}

if (import.meta.main) {
  await runProcess({
    name: 'Database backup',
    shutdownMs: processTiming.apiShutdownMs,
    once: true,
    start: main,
  })
}
