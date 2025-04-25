import { eq } from 'drizzle-orm'
import { db } from '../db'
import { usersTable } from './repoHandler'
import type { UserUpdateRequest, User } from '../types'

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

export async function createUser(
  values: typeof usersTable.$inferInsert,
): Promise<User | null> {
  const userInsert = {
    uuid: values.uuid,
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    password: await Bun.password.hash(values.password),
    avatar: values.avatar,
    role: values.role,
    verified: false,
    verificationToken: values.verificationToken,
    verificationExpires: values.verificationExpires,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.insert(usersTable).values(userInsert)

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
  if (fields.password) {
    fields.password = await Bun.password.hash(fields.password)
  }

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
