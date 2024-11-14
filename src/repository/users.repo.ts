import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import type { RegisterRequest, UserFields } from '../types'

export async function getUserBy(
  field: 'uuid' | 'email' | 'verificationCode' | 'passwordResetCode',
  token: string,
): Promise<UserFields | null> {
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
    throw new Error(`DB Error: getUserBy ${field}`, { cause: error })
  }
}

export async function createUser(values: RegisterRequest) {
  try {
    const user: typeof users.$inferInsert = {
      uuid: crypto.randomUUID(),
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
      password: await Bun.password.hash(values.password),
      avatar: values.avatar || null,
      role: 'user',
      verified: false,
      verificationCode: crypto.randomUUID(),
      verificationExpires: new Date(Date.now() + 86400000).toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await db.insert(users).values(user)

    return user
  } catch (error) {
    throw new Error('DB Error: createUser', { cause: error })
  }
}

export async function updateUser(email: string, fields: Partial<UserFields>) {
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
    throw new Error('DB Error: updateUser', { cause: error })
  }
}
