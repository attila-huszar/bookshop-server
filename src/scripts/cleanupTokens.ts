import { cleanupExpiredTokens } from '../services'
import { logger } from '../libs'

const result = await cleanupExpiredTokens()

if (result.deletedUsers.length) {
  void logger.info('Unverified users cleaned up', {
    unverifiedUsers: result.deletedUsers.map((user) => user.email),
    totalDeleted: result.deletedUsers.length,
  })
}

if (result.updatedUsers.length) {
  void logger.info('Unused password reset tokens cleaned up', {
    unusedPasswordReset: result.updatedUsers.map((user) => user.email),
    totalUpdated: result.updatedUsers.length,
  })
}
