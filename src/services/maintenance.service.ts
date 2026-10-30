import { usersDB } from '@/repositories'
import { log } from '@/libs'
import { cleanupUnusedImages } from './imageCleanup.service'
import { reconcileStaleOrders } from './orders.service'

export async function runMaintenance(
  cleanupImages = cleanupUnusedImages,
): Promise<boolean> {
  const tasks = [
    {
      name: 'password reset token cleanup',
      run: async () => {
        const totalUpdated = await usersDB.cleanupExpiredPasswordResetTokens()

        if (totalUpdated > 0) {
          void log.info('Expired password reset tokens cleaned up', {
            totalUpdated,
          })
        }
      },
    },
    {
      name: 'unverified user cleanup',
      run: async () => {
        const deletedUsers = await usersDB.cleanupUnverifiedUsers()

        if (deletedUsers.length > 0) {
          void log.info('Expired unverified users soft deleted', {
            totalDeleted: deletedUsers.length,
            users: deletedUsers.map((user) => ({
              userId: user.id,
              email: user.email,
            })),
          })
        }
      },
    },
    {
      name: 'order reconciliation',
      run: async () => {
        const { failed } = await reconcileStaleOrders()

        if (failed > 0) {
          throw new Error(`${failed} order(s) could not be reconciled`)
        }
      },
    },
    {
      name: 'unused image cleanup',
      run: async () => {
        const removed = await cleanupImages()

        if (removed > 0) {
          void log.info('Unused uploaded images cleaned up', { removed })
        }
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
