import { join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'
import {
  BACKUP_DIR,
  pruneOldMongoBackups,
  timestamp,
} from './shared/backupHelpers'

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const backupsRoot = resolve(process.cwd(), BACKUP_DIR)
    const mongoBackupDir = join(backupsRoot, 'mongo')

    await Bun.$`mkdir -p ${mongoBackupDir}`

    const outputFile = join(mongoBackupDir, `${timestamp()}.archive.gz`)

    const dumpProcess = Bun.spawn({
      cmd: [
        'mongodump',
        `--uri=${env.dbMongoUrl}`,
        `--archive=${outputFile}`,
        '--gzip',
      ],
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const code = await dumpProcess.exited

    if (code !== 0) {
      throw new Error(`mongodump exited with code ${code}`)
    }

    await pruneOldMongoBackups()

    void log.info('Mongo backup created', { outputFile })
  } catch (error) {
    exitCode = 1
    void log.error('Mongo backup failed', { error })
  }

  process.exit(exitCode)
}

void main()
