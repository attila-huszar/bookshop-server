import { join } from 'node:path'
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
  let backupCreated = false
  let outputFile: string | undefined

  try {
    const mongoBackupDir = getBackupDir(DB_REPO.MONGO)

    await Bun.$`mkdir -p ${mongoBackupDir}`

    outputFile = join(mongoBackupDir, `${timestamp()}.archive.gz`)

    const dumpProcess = Bun.spawn({
      cmd: ['mongodump', `--archive=${outputFile}`, '--gzip'],
      env: {
        ...process.env,
        MONGODB_URI: env.dbMongoUrl,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const code = await waitForProcessExitWithTimeout('mongodump', dumpProcess)

    if (code !== 0) {
      throw new Error(`mongodump exited with code ${code}`)
    }

    backupCreated = true
    await pruneOldBackups({ backupType: DB_REPO.MONGO })

    log.info('Mongo backup created', { outputFile })
  } catch (error) {
    exitCode = 1
    if (outputFile && !backupCreated) {
      await Bun.$`rm -f ${outputFile}`.catch(() =>
        log.warn('Failed to remove incomplete backup file', { outputFile }),
      )
    }
    log.error(
      backupCreated
        ? 'Mongo backup created, but retention cleanup failed'
        : 'Mongo backup failed',
      backupCreated ? { error, outputFile } : { error },
    )
  }

  process.exit(exitCode)
}

void main()
