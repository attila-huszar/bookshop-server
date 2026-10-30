import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { mockLogger, mockOrdersDB, mockUsersDB } from './test-setup'

const { runMaintenance } = await import('@/services/maintenance.service')
const cleanupImages = mock(() => Promise.resolve(0))

describe('Maintenance tasks', () => {
  beforeEach(() => {
    cleanupImages.mockReset().mockResolvedValue(0)
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockReset()
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockResolvedValue(0)
    mockUsersDB.cleanupUnverifiedUsers.mockReset()
    mockUsersDB.cleanupUnverifiedUsers.mockResolvedValue([])
    mockOrdersDB.getOrdersForReconciliation.mockReset()
    mockOrdersDB.getOrdersForReconciliation.mockResolvedValue([])
    mockLogger.info.mockReset()
    mockLogger.error.mockReset()
  })

  it('runs cleanup and reconciliation quietly when nothing is due', async () => {
    expect(await runMaintenance(cleanupImages)).toBe(true)
    expect(mockUsersDB.cleanupExpiredPasswordResetTokens).toHaveBeenCalledTimes(
      1,
    )
    expect(mockUsersDB.cleanupUnverifiedUsers).toHaveBeenCalledTimes(1)
    expect(mockOrdersDB.getOrdersForReconciliation).toHaveBeenCalledTimes(1)
    expect(mockLogger.info).not.toHaveBeenCalled()
    expect(mockLogger.error).not.toHaveBeenCalled()
    expect(cleanupImages).toHaveBeenCalledTimes(1)
  })

  it('logs cleanup counts and the identities of expired registrations', async () => {
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockResolvedValue(3)
    mockUsersDB.cleanupUnverifiedUsers.mockResolvedValue([
      {
        id: 7,
        email: 'expired@example.com',
        password: 'private-hash',
        verificationToken: 'private-verification-token',
        passwordResetToken: 'private-reset-token',
      },
      { id: 8, email: 'another-expired@example.com' },
    ])

    expect(await runMaintenance(cleanupImages)).toBe(true)
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Expired password reset tokens cleaned up',
      { totalUpdated: 3 },
    )
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Expired unverified users soft deleted',
      {
        totalDeleted: 2,
        users: [
          { userId: 7, email: 'expired@example.com' },
          { userId: 8, email: 'another-expired@example.com' },
        ],
      },
    )
    expect(mockLogger.info).toHaveBeenCalledTimes(2)
  })

  it('continues other tasks when one cleanup fails', async () => {
    mockUsersDB.cleanupExpiredPasswordResetTokens.mockRejectedValue(
      new Error('Cleanup failed'),
    )
    expect(await runMaintenance(cleanupImages)).toBe(false)
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
    expect(await runMaintenance(cleanupImages)).toBe(false)
    expect(mockUsersDB.cleanupExpiredPasswordResetTokens).toHaveBeenCalledTimes(
      1,
    )
    expect(mockUsersDB.cleanupUnverifiedUsers).toHaveBeenCalledTimes(1)
  })

  it('does not log removed user identities when cleanup fails', async () => {
    mockUsersDB.cleanupUnverifiedUsers.mockRejectedValue(
      new Error('Cleanup transaction failed'),
    )

    expect(await runMaintenance(cleanupImages)).toBe(false)
    expect(mockLogger.info).not.toHaveBeenCalled()
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Maintenance task failed',
      expect.objectContaining({ task: 'unverified user cleanup' }),
    )
    expect(mockOrdersDB.getOrdersForReconciliation).toHaveBeenCalledTimes(1)
  })

  it('returns failure when an individual order cannot be reconciled', async () => {
    mockOrdersDB.getOrdersForReconciliation.mockResolvedValue([
      { id: 1, paymentId: 'pi_failed' },
    ])
    mockOrdersDB.getOrderById.mockRejectedValueOnce(
      new Error('Order read failed'),
    )
    expect(await runMaintenance(cleanupImages)).toBe(false)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Maintenance task failed',
      expect.objectContaining({ task: 'order reconciliation' }),
    )
  })

  it('reports storage cleanup failures after completing other maintenance', async () => {
    cleanupImages.mockRejectedValueOnce(new Error('Storage unavailable'))

    expect(await runMaintenance(cleanupImages)).toBe(false)
    expect(mockOrdersDB.getOrdersForReconciliation).toHaveBeenCalledTimes(1)
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Maintenance task failed',
      expect.objectContaining({ task: 'unused image cleanup' }),
    )
  })
})
