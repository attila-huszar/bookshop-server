import { mongo, sqliteClient } from '@/db'
import { env } from '@/config'
import { usersDB } from '@/repositories'
import { log } from '@/libs'
import { DB_REPO } from '@/constants'

async function main(): Promise<void> {
  let exitCode = 0

  try {
    const updatedUsers = await usersDB.cleanupExpiredPasswordResetTokens()
    if (updatedUsers.length > 0) {
      void log.info('Unused password reset tokens cleaned up', {
        unusedPasswordReset: updatedUsers.map((u) => u.email),
        totalUpdated: updatedUsers.length,
      })
    }

    const deletedUsers = await usersDB.cleanupUnverifiedUsers()
    if (deletedUsers.length > 0) {
      void log.info('Unverified users cleaned up', {
        unverifiedUsers: deletedUsers.map((u) => u.email),
        totalDeleted: deletedUsers.length,
      })
    }
  } catch (error) {
    exitCode = 1
    void log.error('Cleanup script failed', { error })
  } finally {
    try {
      if (env.dbRepo === DB_REPO.SQLITE) {
        sqliteClient?.close()
      } else if (env.dbRepo === DB_REPO.MONGO) {
        await mongo.connection.close()
      }
    } catch (error) {
      void log.error('Error during shutdown', { error })
    }
  }

  await log.shutdown()
  process.exit(exitCode)
}

void main()
