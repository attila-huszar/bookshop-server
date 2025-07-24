import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { usersTable } from '@/models/sqlite'
import type { UserUpdateRequest, User, UserInsert } from '@/types'

export async function getUserBy(
  field: 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken',
  token: string,
): Promise<User | null> {
  const userRecords = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable[field], token))
    .limit(1)

  if (!userRecords.length) {
    return null
  }

  return userRecords[0]
}

export async function createUser(values: UserInsert): Promise<User | null> {
  await db.insert(usersTable).values(values)

  const userRecords = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, values.email))
    .limit(1)

  if (!userRecords.length) {
    return null
  }

  return userRecords[0]
}

export async function updateUser(
  email: string,
  fields: UserUpdateRequest,
): Promise<User | null> {
  await db.update(usersTable).set(fields).where(eq(usersTable.email, email))

  const userRecords = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1)

  if (!userRecords.length) {
    return null
  }

  return userRecords[0]
}

export async function getAllUsers(): Promise<User[]> {
  const userRecords = await db.select().from(usersTable)
  return userRecords
}
