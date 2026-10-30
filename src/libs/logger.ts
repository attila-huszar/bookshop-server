import { LogLevel, logSchema, safeValidate } from '@/validation'
import type { LogEntry } from '@/types'

const logPriority = { debug: 0, info: 1, warn: 2, error: 3 }
const configuredLogLevel = LogLevel.safeParse(Bun.env.LOG_LEVEL)
const minimumLogLevel = configuredLogLevel.success
  ? configuredLogLevel.data
  : 'info'

export class Logger {
  constructor(private readonly source?: 'frontend') {}

  private emit(level: LogEntry['level'], message: string, meta?: unknown) {
    if (logPriority[level] < logPriority[minimumLogLevel]) {
      return
    }

    const log = safeValidate(logSchema, { level, message, meta })

    if (!log) {
      return
    }

    const logOutput = {
      level: log.level,
      message: log.message,
      meta: this.serialize(log.meta),
      source: this.source,
    }

    console.log(JSON.stringify(logOutput))
  }

  private serialize(
    value: unknown,
    ancestors = new WeakSet<object>(),
  ): unknown {
    if (value === null || typeof value !== 'object') {
      return value
    }

    if (ancestors.has(value)) {
      return '[Circular]'
    }

    ancestors.add(value)

    try {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
          ...(value.cause !== undefined && {
            cause: this.serialize(value.cause, ancestors),
          }),
        }
      }

      if (Array.isArray(value)) {
        return value.map((entry) => this.serialize(entry, ancestors))
      }

      return Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          this.serialize(entry, ancestors),
        ]),
      )
    } finally {
      ancestors.delete(value)
    }
  }

  debug(message: string, meta?: unknown) {
    this.emit(LogLevel.enum.debug, message, meta)
  }

  info(message: string, meta?: unknown) {
    this.emit(LogLevel.enum.info, message, meta)
  }

  warn(message: string, meta?: unknown) {
    this.emit(LogLevel.enum.warn, message, meta)
  }

  error(message: string, meta?: unknown) {
    this.emit(LogLevel.enum.error, message, meta)
  }
}

export const log = new Logger()
export const frontendLog = new Logger('frontend')
