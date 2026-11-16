import { TimeMs } from '@/constants/time'

export const SHUTDOWN_SIGNALS: readonly NodeJS.Signals[] = ['SIGINT', 'SIGTERM']

export const processTiming = {
  apiShutdownMs: TimeMs.TenSeconds,
  maintenanceTimeoutMs: 9 * TimeMs.OneMinute,
  workerShutdownMs: TimeMs.FortyFiveSeconds,
} as const
