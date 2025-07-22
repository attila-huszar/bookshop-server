import { cleanupExpiredTokens } from '@/services'
import { log } from '@/libs'
import { db } from '@/db'

try {
  const result = await cleanupExpiredTokens()

  if (result.deletedUsers.length) {
    void log.info('Unverified users cleaned up', {
      unverifiedUsers: result.deletedUsers.map((user) => user.email),
      totalDeleted: result.deletedUsers.length,
    })
  }

  if (result.updatedUsers.length) {
    void log.info('Unused password reset tokens cleaned up', {
      unusedPasswordReset: result.updatedUsers.map((user) => user.email),
      totalUpdated: result.updatedUsers.length,
    })
  }
} catch (error) {
  void log.error('Cleanup script failed', { error })
} finally {
  db.$client.close()
  process.exit(0)
}
