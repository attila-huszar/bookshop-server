import { join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'
import { DB_REPO } from '@/types/enums'

type PruneBackupsParams =
  | { backupType: DB_REPO.MONGO }
  | { backupType: DB_REPO.SQLITE; sourceFileName: string }

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
  const pattern =
    backupType === DB_REPO.MONGO ? '*.archive.gz' : `*-${params.sourceFileName}`
  const maxAgeMs = Number(env.backupRetentionDays) * 24 * 60 * 60 * 1000
  const files = Array.from(new Bun.Glob(pattern).scanSync({ cwd: directory }))

  const now = Date.now()

  await Promise.all(
    files.map(async (fileName) => {
      const filePath = join(directory, fileName)
      const stat = await Bun.file(filePath).stat()
      if (now - stat.mtimeMs > maxAgeMs) {
        await Bun.$`rm -f ${filePath}`
        void log.info(`Removed old ${backupType} backup`, { filePath })
      }
    }),
  )
}
