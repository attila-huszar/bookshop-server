import { join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'

type BackupDirectory = 'mongo' | 'sqlite'

export function getBackupDir(directory: BackupDirectory): string {
  return join(resolve(process.cwd(), env.backupDir), directory)
}

export function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function pruneOldBackups(
  directory: string,
  pattern: string,
  backupType: 'Mongo' | 'SQLite',
): Promise<void> {
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

export async function pruneOldMongoBackups(): Promise<void> {
  await pruneOldBackups(getBackupDir('mongo'), '*.archive.gz', 'Mongo')
}

export async function pruneOldSqliteBackups(
  sourceFileName: string,
): Promise<void> {
  await pruneOldBackups(getBackupDir('sqlite'), `*-${sourceFileName}`, 'SQLite')
}
