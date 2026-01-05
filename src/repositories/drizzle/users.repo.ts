import { eq, inArray, lt } from 'drizzle-orm'
import { db } from '@/db'
import model from '@/models'
import type { UserUpdate, User, UserInsert } from '@/types'

const { usersTable } = model as SQLiteModel

export async function getUserBy<T extends keyof User>(
  field: T,
  value: string,
): Promise<User | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable[field], value))
    .limit(1)

  return user ?? null
}

export async function createUser(values: UserInsert): Promise<User | null> {
  await db.insert(usersTable).values(values)

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, values.email))
    .limit(1)

  return user ?? null
}

export async function updateUser(
  email: string,
  fields: UserUpdate,
): Promise<User | null> {
  await db.update(usersTable).set(fields).where(eq(usersTable.email, email))

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1)

  return user ?? null
}

export async function getAllUsers(): Promise<User[]> {
  const userRecords = await db.select().from(usersTable)
  return userRecords
}

export async function deleteUserByEmail(
  email: string,
): Promise<User['email'] | null> {
  const deleteResult = await db
    .delete(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1)
    .returning()

  if (deleteResult.length === 0) return null
  return email
}

export async function deleteUsersByIds(
  userIds: number[],
): Promise<User['id'][]> {
  await db.delete(usersTable).where(inArray(usersTable.id, userIds))

  return userIds
}

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
      passwordResetToken: '',
      passwordResetExpires: '',
    })
    .where(lt(usersTable.passwordResetExpires, now))

  return {
    deletedUsers: usersToDelete,
    updatedUsers: usersToUpdate,
  }
}
