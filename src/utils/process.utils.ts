import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { log } from '@/libs/logger'
import { SHUTDOWN_SIGNALS } from '@/constants/process'

type Cleanup = {
  name: string
  close: () => void | Promise<unknown>
}

export type ProcessContext = {
  signal: AbortSignal
  defer: (name: string, close: Cleanup['close']) => void
  force: (close: () => void) => void
  wait: <T>(task: Promise<T>) => Promise<T>
  fail: (error: unknown) => void
}

type ProcessOptions = {
  name: string
  shutdownMs: number
  once?: boolean
  start: (context: ProcessContext) => Promise<void>
}

/** Own resources in acquisition order; drain and close them in reverse order. */
export async function runProcess(input: ProcessOptions): Promise<void> {
  const controller = new AbortController()
  const cleanups: Cleanup[] = []
  const forceClosers: (() => void)[] = []

  let exitCode = 0
  let shutdown: Promise<void> | undefined

  const stop = (code: number): Promise<void> => {
    exitCode = Math.max(exitCode, code)

    if (shutdown) {
      return shutdown
    }

    // Publish the shutdown promise before abort listeners can report failures.
    shutdown = Promise.resolve().then(finishShutdown)

    controller.abort()

    if (!input.once || exitCode !== 0) {
      log.info(`${input.name} shutting down`)
    }

    return shutdown
  }

  async function finishShutdown(): Promise<void> {
    const deadline = setTimeout(() => {
      log.error(`❌ ${input.name} shutdown timed out`, {
        shutdownMs: input.shutdownMs,
      })

      for (const close of forceClosers) {
        try {
          close()
        } catch {
          // Force exit still releases OS resources.
        }
      }

      process.exit(1)
    }, input.shutdownMs)

    try {
      await startup.catch(() => undefined)

      for (const cleanup of cleanups.toReversed()) {
        try {
          await cleanup.close()
        } catch (error) {
          exitCode = 1

          log.error(`❌ ${input.name} cleanup failed`, {
            resource: cleanup.name,
            error,
          })
        }
      }
    } finally {
      clearTimeout(deadline)

      for (const signal of SHUTDOWN_SIGNALS) {
        process.removeListener(signal, onSignal)
      }

      process.exitCode = exitCode

      const drainFile = Bun.env.BOOKSHOP_PROCESS_DRAIN_FILE

      if (drainFile) {
        await writeFile(drainFile, `${exitCode}\n`, { mode: 0o600 })
      }
    }
  }

  const onSignal = () => {
    void stop(input.once ? 1 : 0)
  }

  for (const signal of SHUTDOWN_SIGNALS) {
    process.on(signal, onSignal)
  }

  const context: ProcessContext = {
    signal: controller.signal,
    defer: (name, close) => {
      cleanups.push({ name, close })
    },
    force: (close) => {
      forceClosers.push(close)
    },
    wait: (task) => waitForStartup(task, controller.signal),
    fail: (error) => {
      if (controller.signal.aborted) {
        return
      }

      log.error(`❌ ${input.name} stopped unexpectedly`, { error })
      void stop(1)
    },
  }

  const startup = Promise.resolve().then(async () => {
    const jobDirectory = Bun.env.BOOKSHOP_CRON_JOB_DIRECTORY

    if (input.once && jobDirectory) {
      const pidFile = join(jobDirectory, `${process.pid}.pid`)

      await writeFile(pidFile, `${process.pid}\n`, { flag: 'wx', mode: 0o600 })
      context.defer('cron PID file', () => rm(pidFile, { force: true }))
    }

    controller.signal.throwIfAborted()
    await input.start(context)
  })

  try {
    await startup

    if (input.once) {
      await stop(0)
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      log.error(
        `❌ ${input.name}${input.once ? ' failed' : ' startup failed'}`,
        { error },
      )

      await stop(1)
    } else {
      await shutdown
    }
  }
}

async function waitForStartup<T>(
  task: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  // The underlying task can still reject after cancellation wins the race.
  void task.catch(() => undefined)
  signal.throwIfAborted()

  const interrupted = Promise.withResolvers<never>()
  const onAbort = () =>
    interrupted.reject(new Error('Process startup interrupted'))

  signal.addEventListener('abort', onAbort, { once: true })

  try {
    return await Promise.race([task, interrupted.promise])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}
