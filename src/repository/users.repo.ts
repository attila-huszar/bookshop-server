import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import type { RegisterRequest, UserUpdateRequest, User } from '../types'

export async function getUserBy(
  field: 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken',
  token: string,
): Promise<User | null> {
  try {
    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users[field], token))
      .limit(1)

    if (!userRecords.length) {
      return null
    }

    return userRecords[0]
  } catch (error) {
    throw new Error(
      `getUserBy ${field}: ${error instanceof Error && error.message}`,
    )
  }
}

export async function createUser(
  values: RegisterRequest,
): Promise<User | null> {
  try {
    const userInsert: typeof users.$inferInsert = {
      uuid: crypto.randomUUID(),
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: await Bun.password.hash(values.password),
      avatar: values.avatar ?? null,
      role: 'user',
      verified: false,
      verificationToken: crypto.randomUUID(),
      verificationExpires: new Date(Date.now() + 86400000).toISOString(),
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
  } catch (error) {
    throw new Error(`createUser: ${error instanceof Error && error.message}`)
  }
}

export async function updateUser(
  email: string,
  fields: UserUpdateRequest,
): Promise<User | null> {
  try {
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
  } catch (error) {
    throw new Error(`updateUser: ${error instanceof Error && error.message}`)
  }
}
