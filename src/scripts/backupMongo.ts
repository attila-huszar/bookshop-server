import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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

async function createMongoDumpConfigFile(uri: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const configFile = join(
      tmpdir(),
      `mongodump-${process.pid}-${randomUUID()}.yaml`,
    )

    try {
      await writeFile(configFile, `uri: ${JSON.stringify(uri)}\n`, {
        mode: 0o600,
        flag: 'wx',
      })
      return configFile
    } catch (error) {
      const errorWithCode = error as { code?: string }
      if (errorWithCode?.code === 'EEXIST') {
        continue
      }
      throw error
    }
  }

  throw new Error('Failed to create temporary mongodump config file')
}

async function main(): Promise<void> {
  let exitCode = 0
  let backupCreated = false
  let outputFile: string | undefined
  let configFile: string | undefined

  try {
    const mongoBackupDir = getBackupDir(DB_REPO.MONGO)

    await Bun.$`mkdir -p ${mongoBackupDir}`

    outputFile = join(mongoBackupDir, `${timestamp()}.archive.gz`)

    await Bun.write(outputFile, '', { mode: 0o600 })

    configFile = await createMongoDumpConfigFile(env.dbMongoUrl)

    const dumpProcess = Bun.spawn({
      cmd: [
        'mongodump',
        `--config=${configFile}`,
        `--archive=${outputFile}`,
        '--gzip',
      ],
      env: process.env,
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
  } finally {
    if (configFile) {
      await Bun.$`rm -f ${configFile}`.catch(() => null)
    }
  }

  process.exit(exitCode)
}

void main()
