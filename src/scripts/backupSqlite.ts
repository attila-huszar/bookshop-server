import { basename, join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'
import { DB_REPO } from '@/types/enums'
import {
  getBackupDir,
  pruneOldBackups,
  timestamp,
  waitForProcessExitWithTimeout,
} from './shared/backupHelpers'

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const source = resolve(process.cwd(), env.dbSqliteFile)
    const sourceFileName = basename(source)
    const sqliteBackupDir = getBackupDir(DB_REPO.SQLITE)

    await Bun.$`mkdir -p ${sqliteBackupDir}`

    const outputFile = join(sqliteBackupDir, `${timestamp()}-${sourceFileName}`)

    if (!(await Bun.file(source).exists())) {
      throw new Error(`SQLite file not found: ${source}`)
    }

    const backupProcess = Bun.spawn({
      cmd: ['sqlite3', source],
      stdin: new TextEncoder().encode(
        `.bail on\n.backup main "${outputFile.replace(/"/g, '""')}"\n.exit\n`,
      ),
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const code = await waitForProcessExitWithTimeout(
      'sqlite3 backup',
      backupProcess,
    )

    if (code !== 0) {
      await Bun.$`rm -f ${outputFile}`.catch(() =>
        log.warn('Failed to remove incomplete backup file', { outputFile }),
      )
      throw new Error(`sqlite3 backup exited with code ${code}`)
    }

    await pruneOldBackups({
      backupType: DB_REPO.SQLITE,
      sourceFileName,
    })

    void log.info('SQLite backup created', { source, outputFile })
  } catch (error) {
    exitCode = 1
    void log.error('SQLite backup failed', { error })
  }

  process.exit(exitCode)
}

void main()
