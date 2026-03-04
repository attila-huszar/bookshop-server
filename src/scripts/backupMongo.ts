import { join, resolve } from 'node:path'
import { env } from '@/config'
import { log } from '@/libs'

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function pruneOldBackups(
  directory: string,
  retentionDays: number,
): Promise<void> {
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000
  const files = Array.from(
    new Bun.Glob('*.archive.gz').scanSync({ cwd: directory }),
  )

  const now = Date.now()

  await Promise.all(
    files.map(async (fileName) => {
      const filePath = join(directory, fileName)
      const stat = await Bun.file(filePath).stat()
      if (now - stat.mtimeMs > maxAgeMs) {
        await Bun.$`rm -f ${filePath}`
        void log.info('Removed old Mongo backup', { filePath })
      }
    }),
  )
}

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const backupUri = env.dbMongoUrl
    const backupsRoot = resolve(process.cwd(), env.backupDir)
    const mongoBackupDir = join(backupsRoot, 'mongo')

    await Bun.$`mkdir -p ${mongoBackupDir}`

    const outputFile = join(mongoBackupDir, `${timestamp()}.archive.gz`)

    const dumpProcess = Bun.spawn({
      cmd: [
        'mongodump',
        `--uri=${backupUri}`,
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

    await pruneOldBackups(mongoBackupDir, env.backupRetentionDays)

    void log.info('Mongo backup created', { outputFile })
  } catch (error) {
    exitCode = 1
    void log.error('Mongo backup failed', { error })
  }

  process.exit(exitCode)
}

void main()
