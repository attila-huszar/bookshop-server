import { rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { log } from '@/libs/logger'
import { SHUTDOWN_SIGNALS } from '@/constants/process'

type Cleanup = { name: string; close: () => void | Promise<unknown> }

export type ProcessContext = {
  signal: AbortSignal
  defer: (name: string, close: Cleanup['close']) => void
  force: (close: () => void) => void
  wait: <T>(task: Promise<T>) => Promise<T>
  fail: (error: unknown) => void
}

/** Own resources in acquisition order; drain and close them in reverse order. */
export async function runProcess(input: {
  name: string
  shutdownMs: number
  once?: boolean
  start: (context: ProcessContext) => Promise<void>
}): Promise<void> {
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

    controller.abort()
    log.info(`${input.name} shutting down`)
    shutdown = (async () => {
      const deadline = setTimeout(() => {
        log.error(`${input.name} shutdown timed out`)
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
            log.error(`${input.name} cleanup failed`, {
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
      }
    })()

    return shutdown
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
    wait: async <T>(task: Promise<T>): Promise<T> => {
      void task.catch(() => undefined)
      controller.signal.throwIfAborted()
      let onAbort: () => void = () => undefined
      try {
        return await Promise.race([
          task,
          new Promise<never>((_, reject) => {
            onAbort = () => reject(new Error('Process startup interrupted'))
            controller.signal.addEventListener('abort', onAbort, { once: true })
          }),
        ])
      } finally {
        controller.signal.removeEventListener('abort', onAbort)
      }
    },
    fail: (error) => {
      log.error(`${input.name} stopped unexpectedly`, { error })
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
      log.error(`${input.name}${input.once ? ' failed' : ' startup failed'}`, {
        error,
      })
      await stop(1)
    } else {
      await shutdown
    }
  }
}
