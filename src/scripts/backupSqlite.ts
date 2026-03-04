import { basename, join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'
import {
  getBackupDir,
  pruneOldSqliteBackups,
  timestamp,
} from './shared/backupHelpers'

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const source = resolve(process.cwd(), env.dbSqliteFile)
    const sourceFileName = basename(source)
    const sqliteBackupDir = getBackupDir('sqlite')

    await Bun.$`mkdir -p ${sqliteBackupDir}`

    const outputFile = join(sqliteBackupDir, `${timestamp()}-${sourceFileName}`)

    if (!(await Bun.file(source).exists())) {
      throw new Error(`SQLite file not found: ${source}`)
    }

    const backupProcess = Bun.spawn({
      cmd: ['sqlite3', source, `.backup ${outputFile}`],
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const code = await backupProcess.exited

    if (code !== 0) {
      throw new Error(`sqlite3 backup exited with code ${code}`)
    }

    await pruneOldSqliteBackups(sourceFileName)

    void log.info('SQLite backup created', { source, outputFile })
  } catch (error) {
    exitCode = 1
    void log.error('SQLite backup failed', { error })
  }

  process.exit(exitCode)
}

void main()
