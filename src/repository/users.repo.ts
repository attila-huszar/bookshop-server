import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import { NotFound } from '../errors'
import type { RegisterRequest, UserFields } from '../types'

export async function getUserByUUID(uuid: string): Promise<UserFields | null> {
  const userRecords = await db.select().from(users).where(eq(users.uuid, uuid))

  if (!userRecords.length) {
    return null
  }

  return userRecords[0]
}

export async function getUserByEmail(
  email: string,
): Promise<UserFields | null> {
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, email))

  if (!userRecords.length) {
    return null
  }

  return userRecords[0]
}

export async function createUser(
  values: RegisterRequest,
): Promise<{ email: string }> {
  const user: typeof users.$inferInsert = {
    uuid: crypto.randomUUID(),
    firstName: values.firstName,
    lastName: values.lastName,
    password: await Bun.password.hash(values.password),
    role: 'user',
    email: values.email,
    verified: false,
    verificationCode: crypto.randomUUID(),
    verificationExpires: new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString(),
    createdAt: new Date().toISOString(),
  }

  await db.insert(users).values(user)

  return { email: user.email }
}
