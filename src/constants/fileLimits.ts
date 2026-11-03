import { TimeMs } from '@/constants/time'

export const MAX_IMAGE_SIZE_BYTES = 1024 * 1024
export const MAX_JSON_SIZE_KIB = 100

export const imageProcessingPolicy = {
  maxInputPixels: 10_000_000,
  maxDimensionPixels: 2048,
  webpQuality: 85,
  timeoutMs: TimeMs.FiveSeconds,
} as const

export const imageCleanupGraceMs = TimeMs.OneDay
