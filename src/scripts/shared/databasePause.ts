import { log } from '@/libs/logger'
import { backupTiming } from '@/constants/backup'
import { waitForProcessExitWithTimeout } from './backupArchive'

const coordinator = Bun.fileURLToPath(
  new URL('../../../docker/database-access.sh', import.meta.url),
)

export async function withDatabaseWritesPaused(input: {
  directory: string
  signal?: AbortSignal
  run: (signal: AbortSignal) => Promise<void>
}): Promise<void> {
  if (!input.directory) {
    throw new Error(
      'Logical Mongo backups require BOOKSHOP_DATABASE_COORDINATION_DIR shared by all database writers',
    )
  }

  input.signal?.throwIfAborted()
  const failure = new AbortController()
  const signal = input.signal
    ? AbortSignal.any([input.signal, failure.signal])
    : failure.signal
  const lease = Bun.spawn({
    cmd: ['setsid', '/bin/sh', coordinator, 'backup', input.directory],
    stdin: 'pipe',
    stdout: 'pipe',
    stderr: 'inherit',
  })
  let releasing = false
  let acquired = false

  const stopLease = () => {
    // Once acquired, keep the pause until the dump has terminated and reaped.
    if (acquired) {
      return
    }

    try {
      process.kill(-lease.pid, 'SIGTERM')
    } catch {
      // The coordinator may already have exited.
    }
  }

  signal.addEventListener('abort', stopLease, { once: true })
  void lease.exited.then(() => {
    if (!releasing) {
      failure.abort(
        new Error('Database writer coordination ended unexpectedly'),
      )
    }
  })

  const deadline = setTimeout(() => {
    failure.abort(new Error('Timed out waiting for database writers to drain'))
  }, backupTiming.writerDrainTimeoutMs)
  const reader = lease.stdout.getReader()

  try {
    log.info('Pausing database writers for the logical Mongo backup')
    const ready = await reader.read()
    signal.throwIfAborted()

    if (
      ready.done ||
      new TextDecoder().decode(ready.value).trim() !== 'READY'
    ) {
      throw new Error('Database writers did not confirm a clean drain')
    }

    acquired = true
    clearTimeout(deadline)
    await input.run(signal)
    signal.throwIfAborted()
  } finally {
    releasing = true
    clearTimeout(deadline)
    signal.removeEventListener('abort', stopLease)
    reader.releaseLock()
    await lease.stdin.end()
    await waitForProcessExitWithTimeout(
      'database writer coordinator',
      lease,
      backupTiming.terminationGraceMs,
    )
    log.info('Database writer pause released')
  }
}
