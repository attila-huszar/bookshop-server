import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import type { RegisterRequest, UserUpdateRequest, User } from '../types'

export async function getUserBy(
  field: 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken',
  token: string,
): Promise<User | null> {
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users[field], token))
    .limit(1)

  if (!userRecords.length) {
    return null
  }

  return userRecords[0]
}

export async function createUser(
  values: RegisterRequest,
): Promise<User | null> {
  const userInsert: typeof users.$inferInsert = {
    uuid: crypto.randomUUID(),
    firstName: values.firstName,
    lastName: values.lastName,
    email: values.email,
    password: await Bun.password.hash(values.password),
    avatar: values.avatar ?? null,
    role: 'user',
    verified: false,
    verificationToken: values.verificationToken,
    verificationExpires: values.verificationExpires,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.insert(users).values(userInsert)

  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, values.email))
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
  await db.update(users).set(fields).where(eq(users.email, email))

  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1)

  if (!userRecords.length) {
    return null
  }

  return userRecords[0]
}
