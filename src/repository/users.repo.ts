import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import { DBError } from '../errors'
import type { RegisterRequest, User } from '../types'

export async function getUserBy(
  field: 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken',
  token: string,
): Promise<User> {
  try {
    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users[field], token))
      .limit(1)

    if (!userRecords.length) {
      throw new Error('User does not exist')
    }

    return userRecords[0]
  } catch (error) {
    throw new DBError(
      `getUserBy ${field}: ${error instanceof Error && error.message}`,
    )
  }
}

export async function createUser(values: RegisterRequest): Promise<User> {
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
      throw new Error('User does not exist')
    }

    return userRecords[0]
  } catch (error) {
    throw new DBError(`createUser: ${error instanceof Error && error.message}`)
  }
}

export async function updateUser(
  email: string,
  fields: Partial<User>,
): Promise<User> {
  try {
    await db.update(users).set(fields).where(eq(users.email, email))

    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!userRecords.length) {
      throw new Error('User does not exist')
    }

    return userRecords[0]
  } catch (error) {
    throw new DBError(`updateUser: ${error instanceof Error && error.message}`)
  }
}
