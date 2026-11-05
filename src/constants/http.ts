import { TimeMs } from '@/constants/time'

export const httpPolicy = {
  rateLimitWindowMs: TimeMs.FifteenMinutes,
  rateLimit: 500,
  requestTimeoutMs: TimeMs.TenSeconds,
  termsCacheSeconds: (365 * TimeMs.OneDay) / TimeMs.OneSecond,
} as const
