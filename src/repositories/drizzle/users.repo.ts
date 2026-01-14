import { and, eq, inArray, lt, not } from 'drizzle-orm'
import { db } from '@/db'
import model from '@/models'
import type { User, UserInsert, UserUpdate } from '@/types'

const { usersTable } = model as SQLiteModel

type UserRetrieveBy = Extract<
  keyof User,
  'id' | 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken'
>

export async function getUserBy(
  field: UserRetrieveBy,
  value: string | number,
): Promise<User | null> {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable[field], value))
    .limit(1)
  return user ?? null
}

export async function createUser(values: UserInsert): Promise<User | null> {
  const [createdUser] = await db.insert(usersTable).values(values).returning()
  return createdUser ?? null
}

export async function updateUserBy(
  field: UserRetrieveBy,
  value: string | number,
  fields: UserUpdate,
): Promise<User | null> {
  const [updatedUser] = await db
    .update(usersTable)
    .set(fields)
    .where(eq(usersTable[field], value))
    .returning()
  return updatedUser ?? null
}

export async function getAllUsers(): Promise<User[]> {
  const userRecords = await db.select().from(usersTable)
  return userRecords
}

export async function deleteUserByEmail(
  email: string,
): Promise<User['email'] | null> {
  const [deletedUser] = await db
    .delete(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1)
    .returning()
  return deletedUser?.email ?? null
}

export async function deleteUsersByIds(
  userIds: number[],
): Promise<User['id'][]> {
  await db.delete(usersTable).where(inArray(usersTable.id, userIds))

  return userIds
}

export async function cleanupExpiredTokens() {
  const now = new Date().toISOString()

  const deletedUsers = await db
    .delete(usersTable)
    .where(
      and(
        not(eq(usersTable.verificationExpires, '')),
        lt(usersTable.verificationExpires, now),
      ),
    )
    .returning()

  const updatedUsers = await db
    .update(usersTable)
    .set({
      passwordResetToken: '',
      passwordResetExpires: '',
    })
    .where(
      and(
        not(eq(usersTable.passwordResetExpires, '')),
        lt(usersTable.passwordResetExpires, now),
      ),
    )
    .returning()

  return { deletedUsers, updatedUsers }
}
