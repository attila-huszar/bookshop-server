import { TimeMs } from '@/constants/time'

export const databasePolicy = {
  sqliteBusyTimeoutMs: TimeMs.FiveSeconds,
  mongoSelectionTimeoutMs: TimeMs.TenSeconds,
  mongoSocketTimeoutMs: TimeMs.TenSeconds,
} as const
