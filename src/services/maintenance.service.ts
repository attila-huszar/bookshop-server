import { usersDB } from '@/repositories'
import { log } from '@/libs'
import { reconcileStaleOrders } from './order-reconciliation.service'

export async function runMaintenance(): Promise<boolean> {
  const tasks = [
    {
      name: 'password reset token cleanup',
      run: async () => {
        const users = await usersDB.cleanupExpiredPasswordResetTokens()
        void log.info('Expired password reset tokens cleaned up', {
          totalUpdated: users.length,
        })
      },
    },
    {
      name: 'unverified user cleanup',
      run: async () => {
        const users = await usersDB.cleanupUnverifiedUsers()
        void log.info('Unverified users cleaned up', {
          totalDeleted: users.length,
        })
      },
    },
    {
      name: 'order reconciliation',
      run: async () => {
        const { failed } = await reconcileStaleOrders()
        if (failed > 0)
          throw new Error(`${failed} order(s) could not be reconciled`)
      },
    },
  ]
  let succeeded = true
  for (const task of tasks) {
    try {
      await task.run()
    } catch (error) {
      succeeded = false
      void log.error('Maintenance task failed', { task: task.name, error })
    }
  }
  return succeeded
}
