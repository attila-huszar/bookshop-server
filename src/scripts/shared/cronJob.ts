import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ProcessContext } from '@/utils/process.utils'

export async function registerCronJob(context: ProcessContext): Promise<void> {
  const directory = Bun.env.BOOKSHOP_CRON_JOB_DIRECTORY

  if (directory) {
    const pidFile = join(directory, `${process.pid}.pid`)

    await writeFile(pidFile, `${process.pid}\n`, { flag: 'wx', mode: 0o600 })
    context.defer('cron PID file', () => rm(pidFile, { force: true }))
  }

  context.signal.throwIfAborted()
}
