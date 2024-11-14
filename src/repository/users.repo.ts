import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import type { RegisterRequest, RegisterResponse, UserFields } from '../types'

export async function getUserByUUID(uuid: string): Promise<UserFields | null> {
  try {
    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users.uuid, uuid))

    if (!userRecords.length) {
      return null
    }

    return userRecords[0]
  } catch (error) {
    throw new Error('DB Error: User not found by uuid')
  }
}

export async function getUserByEmail(
  email: string,
): Promise<UserFields | null> {
  try {
    const userRecords = await db
      .select()
      .from(users)
      .where(eq(users.email, email))

    if (!userRecords.length) {
      return null
    }

    return userRecords[0]
  } catch (error) {
    throw new Error('DB Error: User not found by email')
  }
}

export async function createUser(
  values: RegisterRequest,
): Promise<RegisterResponse> {
  try {
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
      updatedAt: new Date().toISOString(),
    }

    await db.insert(users).values(user)

    return { email: user.email, verificationCode: user.verificationCode! }
  } catch (error) {
    throw new Error('DB Error: User not created')
  }
}

export async function verifyUser(email: string) {
  try {
    await db
      .update(users)
      .set({
        verified: true,
        verificationCode: null,
        verificationExpires: null,
      })
      .where(eq(users.email, email))

    return { email }
  } catch (error) {
    throw new Error('DB Error: User not verified')
  }
}
