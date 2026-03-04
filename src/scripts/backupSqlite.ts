import { basename, join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'
import {
  BACKUP_DIR,
  pruneOldSqliteBackups,
  timestamp,
} from './shared/backupHelpers'

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const source = resolve(process.cwd(), env.dbSqliteFile)
    const backupsRoot = resolve(process.cwd(), BACKUP_DIR)
    const sqliteBackupDir = join(backupsRoot, 'sqlite')

    await Bun.$`mkdir -p ${sqliteBackupDir}`

    const outputFile = join(
      sqliteBackupDir,
      `${timestamp()}-${basename(source) || 'db.sqlite'}`,
    )

    const sourceFile = Bun.file(source)

    if (!(await sourceFile.exists())) {
      throw new Error(`SQLite file not found: ${source}`)
    }

    await Bun.write(outputFile, sourceFile)
    await pruneOldSqliteBackups()

    void log.info('SQLite backup created', { source, outputFile })
  } catch (error) {
    exitCode = 1
    void log.error('SQLite backup failed', { error })
  }

  process.exit(exitCode)
}

void main()
