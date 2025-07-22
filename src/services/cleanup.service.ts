import { lt } from 'drizzle-orm'
import { db } from '@/db'
import { usersTable } from '@/repositories/repoHandler'

export async function cleanupExpiredTokens() {
  const now = new Date().toISOString()

  const usersToDelete = await db
    .select()
    .from(usersTable)
    .where(lt(usersTable.verificationExpires, now))

  await db.delete(usersTable).where(lt(usersTable.verificationExpires, now))

  const usersToUpdate = await db
    .select()
    .from(usersTable)
    .where(lt(usersTable.passwordResetExpires, now))

  await db
    .update(usersTable)
    .set({
      passwordResetToken: null,
      passwordResetExpires: null,
    })
    .where(lt(usersTable.passwordResetExpires, now))

  return {
    deletedUsers: usersToDelete,
    updatedUsers: usersToUpdate,
  }
}
