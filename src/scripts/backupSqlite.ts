import { basename, join, resolve } from 'node:path'
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
    new Bun.Glob('*.sqlite').scanSync({ cwd: directory }),
  )

  const now = Date.now()

  await Promise.all(
    files.map(async (fileName) => {
      const filePath = join(directory, fileName)
      const stat = await Bun.file(filePath).stat()
      if (now - stat.mtimeMs > maxAgeMs) {
        await Bun.$`rm -f ${filePath}`
        void log.info('Removed old SQLite backup', { filePath })
      }
    }),
  )
}

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const source = resolve(process.cwd(), env.dbSqliteFile)
    const backupsRoot = resolve(process.cwd(), env.backupDir)
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
    await pruneOldBackups(sqliteBackupDir, env.backupRetentionDays)

    void log.info('SQLite backup created', { source, outputFile })
  } catch (error) {
    exitCode = 1
    void log.error('SQLite backup failed', { error })
  }

  process.exit(exitCode)
}

void main()
