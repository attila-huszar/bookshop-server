import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from './repoHandler'
import { NotFound } from '../errors'
import type { UserFields } from '../types'

export async function getUserByUUID(uuid: string): Promise<UserFields> {
  const userRecords = await db.select().from(users).where(eq(users.uuid, uuid))

  if (!userRecords.length) {
    throw new NotFound()
  }

  return userRecords[0]
}

export async function getUserByEmail(email: string): Promise<UserFields> {
  const userRecords = await db
    .select()
    .from(users)
    .where(eq(users.email, email))

  if (!userRecords.length) {
    throw new NotFound()
  }

  return userRecords[0]
}
