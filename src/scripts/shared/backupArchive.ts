import { createReadStream, createWriteStream } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import type { BunFile } from 'bun'
import { log } from '@/libs/logger'
import { backupTiming } from '@/constants/backup'
import { DB_REPO } from '@/types/enums'
import { getMongoBackupUri, type MongoBackupMode } from './mongoBackupUri'

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
  input.signal?.throwIfAborted()

  const mode = input.mode ?? 'oplog'
  const uri = await getMongoBackupUri({ uri: input.uri, mode })
  const dump =
    input.dump ?? ((command: string[]) => dumpMongo(command, input.signal))

  if (mode === 'logical') {
    log.warn(
      'Mongo logical backups do not capture oplog entries; pause all application, worker, maintenance and other writes for cross-collection consistency',
    )
  }

  await withBackupArchive({
    backupType: DB_REPO.MONGO,
    signal: input.signal,
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

      await dump(command)
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
    signal: input.signal,
    create: async ({ directory, outputFile }) => {
      const snapshot = join(directory, 'snapshot.sqlite')
      await writeFile(snapshot, '', { mode: 0o600, flag: 'wx' })
      const sqlitePath = snapshot.replaceAll('\\', '/').replaceAll('"', '""')

      input.signal?.throwIfAborted()

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
        { signal: input.signal },
      )
    },
    consume: input.consume,
  })
}

type SpawnedProcess = {
  exited: Promise<number>
  kill: (signal?: number | NodeJS.Signals) => void
}

type BackupArchiveInput = {
  backupType: DB_REPO
  signal?: AbortSignal
  create: (context: { directory: string; outputFile: string }) => Promise<void>
  consume: (archive: BunFile) => Promise<void>
}

export type WithBackupArchive = (
  consume: BackupArchiveInput['consume'],
) => Promise<void>

export async function withBackupArchive(
  input: BackupArchiveInput,
): Promise<void> {
  input.signal?.throwIfAborted()

  const directory = await mkdtemp(
    join(tmpdir(), `bookshop-${input.backupType.toLowerCase()}-backup-`),
  )

  try {
    input.signal?.throwIfAborted()

    const outputFile = join(directory, 'backup.gz')
    await writeFile(outputFile, '', { mode: 0o600, flag: 'wx' })
    await input.create({ directory, outputFile })

    input.signal?.throwIfAborted()

    const archive = Bun.file(outputFile)

    if (archive.size === 0) {
      throw new Error(`${input.backupType} backup produced an empty archive`)
    }

    await input.consume(archive)
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(
      (error: unknown) => {
        log.warn('Failed to remove temporary backup files', {
          error,
          directory,
          backupType: input.backupType,
        })
      },
    )
  }
}

export async function waitForProcessExitWithTimeout(
  processName: string,
  spawnedProcess: SpawnedProcess,
  timeoutMs: number = backupTiming.processTimeoutMs,
  signal?: AbortSignal,
): Promise<number> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let graceId: ReturnType<typeof setTimeout> | undefined
  let onAbort: () => void = () => undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${processName} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([
      spawnedProcess.exited,
      timeoutPromise,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error(`${processName} interrupted`))

        if (signal?.aborted) {
          onAbort()
        } else {
          signal?.addEventListener('abort', onAbort, { once: true })
        }
      }),
    ])
  } catch (error: unknown) {
    try {
      spawnedProcess.kill('SIGTERM')
    } catch {
      // Ignore if the process has already exited.
    }

    const exited = await Promise.race([
      spawnedProcess.exited.then(() => true),
      new Promise<false>((resolve) => {
        graceId = setTimeout(
          () => resolve(false),
          backupTiming.terminationGraceMs,
        )
      }),
    ])

    if (!exited) {
      try {
        spawnedProcess.kill('SIGKILL')
      } catch {
        // Ignore if the process has already exited.
      }

      await spawnedProcess.exited
    }

    throw error
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    clearTimeout(graceId)
    signal?.removeEventListener('abort', onAbort)
  }
}
