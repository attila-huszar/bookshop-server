import { S3Client } from '@aws-sdk/client-s3'
import { env } from '@/config/env'
import { validateEnv } from '@/config/validateEnv'
import { type ProcessContext, runProcess } from '@/utils/process.utils'
import { log } from '@/libs/logger'
import { backupTiming } from '@/constants/backup'
import { processTiming } from '@/constants/process'
import { DB_REPO, MongoBackupMode } from '@/types/enums'
import {
  type WithBackupArchive,
  withMongoOplogArchive,
  withSqliteArchive,
} from './shared/backupArchive'
import { backupToStorage } from './shared/backupStorage'
import { withMongoLogicalArchive } from './shared/mongoLogicalArchive'
import { createS3BackupStorage } from './shared/s3BackupStorage'

async function main(context: ProcessContext): Promise<void> {
  const backupType = env.dbRepo
  const label = backupType === DB_REPO.SQLITE ? 'SQLite' : 'Mongo'
  const { awsBucket, awsRegion, awsAccessKeyId, awsSecretAccessKey } = env
  const isS3ConfigMissing =
    !awsBucket || !awsRegion || !awsAccessKeyId || !awsSecretAccessKey

  if (isS3ConfigMissing) {
    throw new Error(
      `${label} backups require the AWS S3 bucket, region and credentials`,
    )
  }

  validateEnv('backup')
  context.signal.throwIfAborted()
  const mongoMode =
    backupType === DB_REPO.MONGO ? env.mongoBackupMode : undefined

  const client = new S3Client({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
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
      const mongoArchive = {
        uri: env.dbMongoUrl ?? '',
        consume,
        signal: context.signal,
      }

      if (mongoMode === MongoBackupMode.Oplog) {
        return withMongoOplogArchive(mongoArchive)
      }

      return withMongoLogicalArchive(mongoArchive)
    }

    return withSqliteArchive({
      source: env.dbSqliteFile,
      consume,
      signal: context.signal,
    })
  }

  const storage = createS3BackupStorage({
    client,
    bucket: awsBucket,
    signal: context.signal,
  })

  const result = await backupToStorage({
    backupType,
    mongoMode,
    namespace: env.databaseNamespace,
    retention: env.backupRetention,
    dryRun: env.backupRetentionDryRun,
    withArchive,
    storage,
  })

  log.info(`${label} backup uploaded and verified`, {
    bucket: awsBucket,
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
