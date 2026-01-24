import { LogLevel, logSchema, safeValidate } from '@/validation'
import type { LogEntry } from '@/types'

export class Logger {
  private emit(
    level: LogEntry['level'],
    message: string,
    meta?: Record<string, unknown>,
  ) {
    const log = safeValidate(logSchema, { level, message, meta })
    if (!log) return

    const logOutput = {
      level: log.level,
      message: log.message,
      ...log.meta,
    }

    console.log(JSON.stringify(logOutput))
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.emit(LogLevel.enum.debug, message, meta)
  }
  info(message: string, meta?: Record<string, unknown>) {
    this.emit(LogLevel.enum.info, message, meta)
  }
  warn(message: string, meta?: Record<string, unknown>) {
    this.emit(LogLevel.enum.warn, message, meta)
  }
  error(message: string, meta?: Record<string, unknown>) {
    this.emit(LogLevel.enum.error, message, meta)
  }
}

export const log = new Logger()
