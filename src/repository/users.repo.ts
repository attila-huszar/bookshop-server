import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import type { UserResponse } from '../types'
import { NotFoundError } from '../errors'

export async function getUserByUUID(uuid: string): Promise<UserResponse> {
  const userRecords = await db.select().from(users).where(eq(users.uuid, uuid))

  if (!userRecords.length) {
    throw new NotFoundError('User not found')
  }

  const {
    id,
    password,
    verificationCode,
    verificationExpires,
    passwordResetCode,
    passwordResetExpires,
    ...userWithoutCreds
  } = userRecords[0]

  return userWithoutCreds
}

export async function getUserByEmail(email: string): Promise<UserResponse> {
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, email))

  if (!userRecords.length) {
    throw new NotFoundError('User not found')
  }

  const {
    id,
    password,
    verificationCode,
    verificationExpires,
    passwordResetCode,
    passwordResetExpires,
    ...userWithoutCreds
  } = userRecords[0]

  return userWithoutCreds
}
