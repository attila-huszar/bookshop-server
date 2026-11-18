import { log } from '@/libs/logger'
import { SHUTDOWN_SIGNALS } from '@/constants/process'

type Cleanup = {
  name: string
  close: () => void | Promise<unknown>
}

export type ProcessContext = {
  signal: AbortSignal
  /** Registers cleanup to run in reverse registration order. */
  defer: (name: string, close: Cleanup['close']) => void
  /** Registers a synchronous callback to run before forced exit. */
  onShutdownTimeout: (close: () => void) => void
  /** Waits for startup work or rejects when shutdown begins. */
  waitForStartup: <T>(task: Promise<T>) => Promise<T>
  /** Reports a fatal error and starts shutdown with a failure exit code. */
  fail: (error: unknown) => void
}

type ProcessOptions = {
  name: string
  shutdownMs: number
  once?: boolean
  /** Acquires service resources or runs a one-off job. */
  start: (context: ProcessContext) => Promise<void>
}

/** Starts a service or one-off job and coordinates graceful shutdown. */
export async function runProcess(input: ProcessOptions): Promise<void> {
  const { name, shutdownMs, once = false } = input
  const controller = new AbortController()
  const { signal } = controller
  const cleanups: Cleanup[] = []
  const timeoutHandlers: (() => void)[] = []

  let exitCode = 0
  let shutdown: Promise<void> | undefined
  let interruptedBySignal = false

  /** Starts shutdown once and preserves a failure exit code. */
  function requestShutdown(code: number): Promise<void> {
    exitCode = Math.max(exitCode, code)

    if (shutdown) {
      return shutdown
    }

    // Publish the shutdown promise before abort listeners can report failures.
    shutdown = Promise.resolve().then(finishShutdown)

    controller.abort()

    if (!once || exitCode !== 0) {
      log.info(`${name} shutting down`)
    }

    return shutdown
  }

  /** Applies one deadline to startup completion and resource cleanup. */
  async function finishShutdown(): Promise<void> {
    let resource = 'startup'
    const deadline = setTimeout(() => {
      log.error(`❌ ${name} shutdown timed out`, { shutdownMs, resource })

      for (const handleTimeout of timeoutHandlers) {
        try {
          handleTimeout()
        } catch {
          // Force exit still releases OS resources.
        }
      }

      process.exit(1)
    }, shutdownMs)

    try {
      await startup.catch(() => undefined)

      for (const cleanup of cleanups.toReversed()) {
        resource = cleanup.name

        try {
          await cleanup.close()
        } catch (error) {
          exitCode = 1

          log.error(`❌ ${name} cleanup failed`, {
            resource: cleanup.name,
            error,
          })
        }
      }
    } finally {
      clearTimeout(deadline)

      for (const signalName of SHUTDOWN_SIGNALS) {
        process.removeListener(signalName, onSignal)
      }

      // Bun keeps the file watcher active after the app has closed its resources.
      if (interruptedBySignal && process.execArgv.includes('--watch')) {
        process.exit(exitCode)
      }

      process.exitCode = exitCode
    }
  }

  /** Starts shutdown and marks an interrupted one-off job as failed. */
  function onSignal() {
    interruptedBySignal = true
    void requestShutdown(once ? 1 : 0)
  }

  const context: ProcessContext = {
    signal,
    defer: (name, close) => {
      cleanups.push({ name, close })
    },
    onShutdownTimeout: (close) => {
      timeoutHandlers.push(close)
    },
    waitForStartup: (task) => waitForStartup(task, signal),
    fail: (error) => {
      if (shutdown) {
        return
      }

      log.error(`❌ ${name} stopped unexpectedly`, { error })
      void requestShutdown(1)
    },
  }

  for (const signalName of SHUTDOWN_SIGNALS) {
    process.on(signalName, onSignal)
  }

  const startup = Promise.resolve().then(() => {
    signal.throwIfAborted()

    return input.start(context)
  })

  try {
    await startup
  } catch (error) {
    if (!shutdown) {
      log.error(`❌ ${name}${once ? ' failed' : ' startup failed'}`, { error })
      await requestShutdown(1)

      return
    }
  }

  if (shutdown) {
    await shutdown
  } else if (once) {
    await requestShutdown(0)
  }
}

/** Races startup work against shutdown. The caller owns the underlying task. */
async function waitForStartup<T>(
  task: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    // Observe the task's rejection before aborting the wait.
    void task.catch(() => undefined)
    signal.throwIfAborted()
  }

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
