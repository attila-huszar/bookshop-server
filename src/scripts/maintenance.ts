import { closeDatabase, connectDatabase } from '@/db'
import { runMaintenance } from '@/services/maintenance.service'
import { log } from '@/libs'

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
    await connectDatabase()

    if (!(await runMaintenance())) {
      exitCode = 1
    }
  } catch (error) {
    exitCode = 1
    void log.error('Maintenance script failed', { error })
  } finally {
    try {
      await closeDatabase()
    } catch (error) {
      exitCode = 1
      void log.error('Error during shutdown', { error })
    }
  }

  clearTimeout(timeout)
  process.exit(exitCode)
}

if (import.meta.main) {
  void main()
}
