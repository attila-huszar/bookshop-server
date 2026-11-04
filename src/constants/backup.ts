import { TimeMs } from '@/constants/time'

export const backupScriptPath = Bun.fileURLToPath(
  new URL('../scripts/backup.ts', import.meta.url),
)

export const backupTiming = {
  writerDrainTimeoutMs: TimeMs.OneMinute,
  processTimeoutMs: TimeMs.ThirtyMinutes,
  terminationGraceMs: TimeMs.FiveSeconds,
  connectionTimeoutMs: TimeMs.TenSeconds,
  socketTimeoutMs: TimeMs.OneMinute,
  requestTimeoutMs: TimeMs.FiveMinutes,
} as const

export const backupRetentionPolicy = {
  daily: 7,
  weekly: 4,
  monthly: 12,
  minAgeMs: TimeMs.OneDay,
} as const

export const backupUploadPolicy = {
  partSizeBytes: 8 * 1024 * 1024,
  maxParts: 10_000,
  concurrency: 2,
} as const
