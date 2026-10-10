export const reconciliationPolicy = {
  minimumOrderAgeMs: 5 * 60_000,
  pendingCheckIntervalMs: 30 * 60_000,
  terminalAuditIntervalMs: 24 * 60 * 60_000,
  failureRetryIntervalMs: 5 * 60_000,
  failuresBeforeAlert: 3,
  batchSize: 100,
  runBudgetMs: 8 * 60_000,
}
