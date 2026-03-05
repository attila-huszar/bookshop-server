import { stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'
import { DB_REPO } from '@/types/enums'

type PruneBackupsParams =
  | { backupType: DB_REPO.MONGO }
  | { backupType: DB_REPO.SQLITE; sourceFileName: string }

type SpawnedProcess = {
  exited: Promise<number>
  kill: (signal?: number | NodeJS.Signals) => void
}

export const BACKUP_PROCESS_TIMEOUT_MS = 30 * 60 * 1000

export function getBackupDir(backupType: DB_REPO): string {
  return join(resolve(process.cwd(), env.backupDir), backupType.toLowerCase())
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

export async function pruneOldBackups(
  params: PruneBackupsParams,
): Promise<void> {
  const { backupType } = params
  const directory = getBackupDir(backupType)

  const retentionDays = Number(env.backupRetentionDays)
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    throw new Error(
      `Invalid BACKUP_RETENTION_DAYS: ${env.backupRetentionDays}. It must be a positive integer.`,
    )
  }

  const directoryStat = await stat(directory).catch(() => null)
  if (!directoryStat?.isDirectory()) return

  const pattern =
    backupType === DB_REPO.MONGO ? '*.archive.gz' : `*-${params.sourceFileName}`
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000
  const files = await Array.fromAsync(
    new Bun.Glob(pattern).scan({ cwd: directory }),
  )

  const now = Date.now()

  await Promise.all(
    files.map(async (fileName) => {
      const filePath = join(directory, fileName)
      const fileStat = await Bun.file(filePath)
        .stat()
        .catch(() => null)
      if (fileStat && now - fileStat.mtimeMs > maxAgeMs) {
        await Bun.$`rm -f ${filePath}`
        void log.info(`Removed old ${backupType} backup`, { filePath })
      }
    }),
  )
}

export async function waitForProcessExitWithTimeout(
  processName: string,
  process: SpawnedProcess,
  timeoutMs = BACKUP_PROCESS_TIMEOUT_MS,
): Promise<number> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${processName} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([process.exited, timeoutPromise])
  } catch (error) {
    process.kill('SIGTERM')
    throw error
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}
