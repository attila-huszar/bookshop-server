import { createReadStream, createWriteStream } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { S3Client } from '@aws-sdk/client-s3'
import type { BunFile } from 'bun'
import { env } from '@/config/env'
import { validateEnv } from '@/config/validateEnv'
import { type ProcessContext, runProcess } from '@/utils/processLifecycle.utils'
import { log } from '@/libs/logger'
import { backupTiming } from '@/constants/backup'
import { processTiming } from '@/constants/process'
import { DB_REPO } from '@/types/enums'
import {
  waitForProcessExitWithTimeout,
  withBackupArchive,
} from './shared/backupHelpers'
import { backupToStorage } from './shared/backupStorage'
import {
  getMongoBackupUri,
  type MongoBackupMode,
} from './shared/mongoBackupUri'
import { createS3BackupStorage } from './shared/s3BackupStorage'

type MongoArchiveInput = {
  uri: string
  mode?: MongoBackupMode
  consume: (archive: BunFile) => Promise<void>
  dump?: (command: string[]) => Promise<void>
  signal?: AbortSignal
}

async function dumpMongo(
  command: string[],
  signal?: AbortSignal,
): Promise<void> {
  signal?.throwIfAborted()
  const dumpProcess = Bun.spawn({
    cmd: command,
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await waitForProcessExitWithTimeout(
    'mongodump',
    dumpProcess,
    undefined,
    signal,
  )

  if (code !== 0) {
    throw new Error(`mongodump exited with code ${code}`)
  }
}

export async function withMongoArchive(
  input: MongoArchiveInput,
): Promise<void> {
  const mode = input.mode ?? 'oplog'
  const uri = await getMongoBackupUri({ uri: input.uri, mode })

  if (mode === 'logical') {
    log.warn(
      'Mongo logical backups do not capture oplog entries; pause all application, worker, maintenance and other writes for cross-collection consistency',
    )
  }

  await withBackupArchive({
    backupType: DB_REPO.MONGO,
    create: async ({ directory, outputFile }) => {
      const configFile = join(directory, 'mongodump.yaml')
      await writeFile(configFile, `uri: ${JSON.stringify(uri)}\n`, {
        mode: 0o600,
        flag: 'wx',
      })
      const command = [
        'mongodump',
        `--config=${configFile}`,
        `--archive=${outputFile}`,
        '--gzip',
      ]

      if (mode === 'oplog') {
        command.push('--oplog')
      }

      await (input.dump ?? ((args) => dumpMongo(args, input.signal)))(command)
    },
    consume: input.consume,
  })
}

type SqliteArchiveInput = {
  source: string
  consume: (archive: BunFile) => Promise<void>
  signal?: AbortSignal
}

export async function withSqliteArchive(
  input: SqliteArchiveInput,
): Promise<void> {
  const source = resolve(input.source)
  input.signal?.throwIfAborted()

  if (!(await Bun.file(source).exists())) {
    throw new Error(`SQLite file not found: ${source}`)
  }

  await withBackupArchive({
    backupType: DB_REPO.SQLITE,
    create: async ({ directory, outputFile }) => {
      const snapshot = join(directory, 'snapshot.sqlite')
      await writeFile(snapshot, '', { mode: 0o600, flag: 'wx' })
      const sqlitePath = snapshot.replaceAll('\\', '/').replaceAll('"', '""')
      const backupProcess = Bun.spawn({
        cmd: ['sqlite3', '-readonly', source],
        stdin: new TextEncoder().encode(
          `.bail on\n.backup main "${sqlitePath}"\n.exit\n`,
        ),
        stdout: 'inherit',
        stderr: 'inherit',
      })
      const code = await waitForProcessExitWithTimeout(
        'sqlite3 backup',
        backupProcess,
        undefined,
        input.signal,
      )

      if (code !== 0) {
        throw new Error(`sqlite3 backup exited with code ${code}`)
      }

      await pipeline(
        createReadStream(snapshot),
        createGzip(),
        createWriteStream(outputFile, { mode: 0o600 }),
      )
    },
    consume: input.consume,
  })
}

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
  const result = await backupToStorage({
    backupType,
    retention: {
      daily: Number(env.backupRetentionDaily),
      weekly: Number(env.backupRetentionWeekly),
      monthly: Number(env.backupRetentionMonthly),
    },
    dryRun: env.backupRetentionDryRun,
    withArchive: (consume) =>
      backupType === DB_REPO.MONGO
        ? withMongoArchive({
            uri: env.dbMongoUrl ?? '',
            mode: env.mongoBackupMode,
            consume,
            signal: context.signal,
          })
        : withSqliteArchive({
            source: env.dbSqliteFile,
            consume,
            signal: context.signal,
          }),
    storage: createS3BackupStorage({
      client,
      bucket: env.awsBucket,
      signal: context.signal,
    }),
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
