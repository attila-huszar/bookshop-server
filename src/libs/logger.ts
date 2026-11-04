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
      message: this.serialize(log.message),
      meta: this.serialize(log.meta),
      source: this.source,
    }

    console.log(JSON.stringify(logOutput))
  }

  private serialize(
    value: unknown,
    ancestors = new WeakSet<object>(),
  ): unknown {
    if (typeof value === 'string') {
      return this.redact(value)
    }

    if (value === null || typeof value !== 'object') {
      return value
    }

    if (ancestors.has(value)) {
      return '[Circular]'
    }

    ancestors.add(value)

    try {
      if (value instanceof Error) {
        const serialized: Record<string, unknown> = {
          name: value.name,
          message: this.serialize(value.message, ancestors),
          stack: this.serialize(value.stack, ancestors),
        }

        const code = 'code' in value ? value.code : undefined

        if (
          typeof code === 'number' ||
          (typeof code === 'string' && /^[A-Z][A-Z0-9_]*$/.test(code))
        ) {
          serialized.code = code
        }

        if ('stage' in value) {
          serialized.stage = value.stage
        }

        if ('originalName' in value) {
          serialized.originalName = value.originalName
        }

        if (value.cause !== undefined) {
          serialized.cause = this.serialize(value.cause, ancestors)
        }

        return serialized
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

  private redact(value: string): string {
    let sanitized = value.replace(
      /((?:mongodb(?:\+srv)?|rediss?|https?):\/\/)[^\s/@]*@/gi,
      '$1[redacted]@',
    )

    for (const [key, secret] of Object.entries(Bun.env)) {
      if (
        /PASSWORD|PASS$|SECRET|TOKEN|KEY/.test(key) &&
        secret &&
        secret.length >= 4
      ) {
        sanitized = sanitized.replaceAll(secret, '[redacted]')
      }
    }

    return sanitized
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
