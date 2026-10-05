import { mongo, sqliteClient } from '@/db'
import { env } from '@/config'
import { runMaintenance } from '@/services/maintenance.service'
import { log } from '@/libs'
import { emailQueue, flushQueuedEmails } from '@/queues'
import { DB_REPO } from '@/types/enums'

async function main(): Promise<void> {
  let exitCode = 0
  const timeout = setTimeout(
    () => {
      log.error('Maintenance exceeded its nine-minute time limit')
      process.exit(1)
    },
    9 * 60 * 1000,
  )

  try {
    if (!(await runMaintenance())) exitCode = 1
  } catch (error) {
    exitCode = 1
    void log.error('Maintenance script failed', { error })
  } finally {
    try {
      await flushQueuedEmails()
    } catch (error) {
      exitCode = 1
      void log.error('Failed to drain maintenance email queue', { error })
    }
    try {
      await emailQueue.close()
    } catch (error) {
      exitCode = 1
      void log.error('Failed to close maintenance email queue', { error })
    }
    try {
      if (env.dbRepo === DB_REPO.SQLITE) {
        sqliteClient?.close()
      } else if (env.dbRepo === DB_REPO.MONGO) {
        await mongo.connection.close()
      }
    } catch (error) {
      exitCode = 1
      void log.error('Error during shutdown', { error })
    }
  }

  clearTimeout(timeout)
  process.exit(exitCode)
}

void main()
