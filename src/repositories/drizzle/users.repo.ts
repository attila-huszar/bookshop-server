import { and, eq, inArray, lt } from 'drizzle-orm'
import { sqlite } from '@/db'
import model from '@/models'
import type { GetUserBy, User, UserInsert, UserUpdate } from '@/types'

const { usersTable } = model as SQLiteModel

export async function getUserBy(
  field: GetUserBy,
  value: string | number,
): Promise<User | null> {
  const [user] = await sqlite
    .select()
    .from(usersTable)
    .where(eq(usersTable[field], value))
    .limit(1)
  return user ?? null
}

export async function createUser(values: UserInsert): Promise<User | null> {
  const [createdUser] = await sqlite
    .insert(usersTable)
    .values(values)
    .returning()
  return createdUser ?? null
}

export async function updateUserBy(
  field: GetUserBy,
  value: string | number,
  fields: UserUpdate,
): Promise<User | null> {
  const [updatedUser] = await sqlite
    .update(usersTable)
    .set({ ...fields, updatedAt: new Date() })
    .where(eq(usersTable[field], value))
    .returning()
  return updatedUser ?? null
}

export async function getAllUsers(): Promise<User[]> {
  const users = await sqlite.select().from(usersTable)
  return users
}

export async function deleteUserBy(
  field: GetUserBy,
  value: string | number,
): Promise<User['email'] | null> {
  const [deletedUser] = await sqlite
    .delete(usersTable)
    .where(eq(usersTable[field], value))
    .limit(1)
    .returning()
  return deletedUser?.email ?? null
}

export async function deleteUsersByIds(
  userIds: number[],
): Promise<User['id'][]> {
  await sqlite.delete(usersTable).where(inArray(usersTable.id, userIds))
  return userIds
}

export async function cleanupExpiredPasswordResetTokens(): Promise<User[]> {
  const updatedUsers = await sqlite
    .update(usersTable)
    .set({
      passwordResetToken: null,
      passwordResetExpires: null,
    })
    .where(lt(usersTable.passwordResetExpires, new Date()))
    .returning()
  return updatedUsers
}

export async function cleanupUnverifiedUsers(): Promise<User[]> {
  const deletedUsers = await sqlite
    .delete(usersTable)
    .where(
      and(
        eq(usersTable.verified, false),
        lt(usersTable.verificationExpires, new Date()),
      ),
    )
    .returning()
  return deletedUsers
}
