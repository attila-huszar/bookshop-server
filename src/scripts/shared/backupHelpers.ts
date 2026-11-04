import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BunFile } from 'bun'
import { log } from '@/libs/logger'
import { backupTiming } from '@/constants/backup'
import { DB_REPO } from '@/types/enums'

type SpawnedProcess = {
  exited: Promise<number>
  kill: (signal?: number | NodeJS.Signals) => void
}

type BackupArchiveInput = {
  backupType: DB_REPO
  create: (context: { directory: string; outputFile: string }) => Promise<void>
  consume: (archive: BunFile) => Promise<void>
}

export type WithBackupArchive = (
  consume: BackupArchiveInput['consume'],
) => Promise<void>

export async function withBackupArchive(
  input: BackupArchiveInput,
): Promise<void> {
  const directory = await mkdtemp(
    join(tmpdir(), `bookshop-${input.backupType.toLowerCase()}-backup-`),
  )

  try {
    const outputFile = join(directory, 'backup.gz')
    await writeFile(outputFile, '', { mode: 0o600, flag: 'wx' })
    await input.create({ directory, outputFile })
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
