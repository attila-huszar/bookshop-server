import { TimeMs } from '@/constants/time'

export const reconciliationPolicy = {
  minimumOrderAgeMs: TimeMs.FiveMinutes,
  pendingCheckMs: TimeMs.ThirtyMinutes,
  terminalAuditMs: TimeMs.OneDay,
  failureRetryMs: TimeMs.FiveMinutes,
  failuresBeforeAlert: 3,
  batchSize: 100,
  runBudgetMs: 8 * TimeMs.OneMinute,
} as const
