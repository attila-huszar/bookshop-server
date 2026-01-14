import { LogBullLogger, LogLevel } from 'logbull'
import { env } from '@/config'

export const log = new LogBullLogger({
  host: env.logbullHost,
  projectId: env.logbullProjectId,
  apiKey: env.logbullApiKey,
  logLevel: LogLevel.INFO,
})
