import { join, resolve } from 'node:path'
import { log } from '@/libs'

export const BACKUP_DIR = 'data/backups'
export const BACKUP_RETENTION_DAYS = 7

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function pruneOldBackups(
  directory: string,
  pattern: string,
  backupType: 'Mongo' | 'SQLite',
): Promise<void> {
  const maxAgeMs = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000
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

export async function pruneOldMongoBackups(): Promise<void> {
  const backupsRoot = resolve(process.cwd(), BACKUP_DIR)
  const mongoBackupDir = join(backupsRoot, 'mongo')
  await pruneOldBackups(mongoBackupDir, '*.archive.gz', 'Mongo')
}

export async function pruneOldSqliteBackups(): Promise<void> {
  const backupsRoot = resolve(process.cwd(), BACKUP_DIR)
  const sqliteBackupDir = join(backupsRoot, 'sqlite')
  await pruneOldBackups(sqliteBackupDir, '*.sqlite', 'SQLite')
}
