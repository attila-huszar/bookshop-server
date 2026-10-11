import { beforeEach, describe, expect, it } from 'bun:test'
import { mockLogger, mockOrdersDB, mockUsersDB } from './test-setup'

const { runMaintenance } = await import('@/services/maintenance.service')

describe('Maintenance tasks', () => {
  beforeEach(() => {
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockReset()
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockResolvedValue(0)
    mockUsersDB.cleanupUnverifiedUsers.mockReset()
    mockUsersDB.cleanupUnverifiedUsers.mockResolvedValue(0)
    mockOrdersDB.getOrdersForReconciliation.mockReset()
    mockOrdersDB.getOrdersForReconciliation.mockResolvedValue([])
    mockLogger.error.mockReset()
  })

  it('runs cleanup and reconciliation successfully', async () => {
    expect(await runMaintenance()).toBe(true)
    expect(mockUsersDB.cleanupExpiredPasswordResetTokens).toHaveBeenCalledTimes(
      1,
    )
    expect(mockUsersDB.cleanupUnverifiedUsers).toHaveBeenCalledTimes(1)
    expect(mockOrdersDB.getOrdersForReconciliation).toHaveBeenCalledTimes(1)
  })

  it('logs the counts returned by each cleanup', async () => {
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockResolvedValue(3)
    mockUsersDB.cleanupUnverifiedUsers.mockResolvedValue(2)

    expect(await runMaintenance()).toBe(true)
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Expired password reset tokens cleaned up',
      { totalUpdated: 3 },
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Expired unverified users soft deleted',
      { totalDeleted: 2 },
    )
  })

  it('continues other tasks when one cleanup fails', async () => {
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockRejectedValue(
      new Error('Cleanup failed'),
    )
    expect(await runMaintenance()).toBe(false)
    expect(mockUsersDB.cleanupUnverifiedUsers).toHaveBeenCalledTimes(1)
    expect(mockOrdersDB.getOrdersForReconciliation).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Maintenance task failed',
      expect.objectContaining({ task: 'password reset token cleanup' }),
    )
  })

  it('reports reconciliation selection failures without undoing cleanup', async () => {
    mockOrdersDB.getOrdersForReconciliation.mockRejectedValue(
      new Error('Database unavailable'),
    )
    expect(await runMaintenance()).toBe(false)
    expect(mockUsersDB.cleanupExpiredPasswordResetTokens).toHaveBeenCalledTimes(
      1,
    )
    expect(mockUsersDB.cleanupUnverifiedUsers).toHaveBeenCalledTimes(1)
  })

  it('returns failure when an individual order cannot be reconciled', async () => {
    mockOrdersDB.getOrdersForReconciliation.mockResolvedValue([
      { id: 1, paymentId: 'pi_failed' },
    ])
    mockOrdersDB.getOrderById.mockRejectedValueOnce(
      new Error('Order read failed'),
    )
    expect(await runMaintenance()).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Maintenance task failed',
      expect.objectContaining({ task: 'order reconciliation' }),
    )
  })
})
