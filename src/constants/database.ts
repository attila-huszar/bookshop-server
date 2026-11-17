import { TimeMs } from '@/constants/time'

export const MONGO_DUPLICATE_KEY_CODE = 11000

export const databasePolicy = {
  sqliteBusyTimeoutMs: TimeMs.FiveSeconds,
  mongoSelectionTimeoutMs: TimeMs.TenSeconds,
  mongoSocketTimeoutMs: TimeMs.TenSeconds,
} as const
