import { join } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'
import { DB_REPO } from '@/types/enums'
import {
  getBackupDir,
  pruneOldBackups,
  timestamp,
} from './shared/backupHelpers'

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const mongoBackupDir = getBackupDir(DB_REPO.MONGO)

    await Bun.$`mkdir -p ${mongoBackupDir}`

    const outputFile = join(mongoBackupDir, `${timestamp()}.archive.gz`)

    const dumpProcess = Bun.spawn({
      cmd: ['mongodump', `--archive=${outputFile}`, '--gzip'],
      env: {
        ...process.env,
        MONGODB_URI: env.dbMongoUrl,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    })

    const code = await dumpProcess.exited

    if (code !== 0) {
      await Bun.$`rm -f ${outputFile}`.catch(() =>
        log.warn('Failed to remove incomplete backup file', { outputFile }),
      )
      throw new Error(`mongodump exited with code ${code}`)
    }

    await pruneOldBackups({ backupType: DB_REPO.MONGO })

    void log.info('Mongo backup created', { outputFile })
  } catch (error) {
    exitCode = 1
    void log.error('Mongo backup failed', { error })
  }

  process.exit(exitCode)
}

void main()
