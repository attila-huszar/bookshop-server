import { and, eq, gt, inArray, isNotNull, isNull, lt } from 'drizzle-orm'
import { sqlite } from '@/db'
import { usersTable } from '@/models/sqlite'
import { emailOutboxTable } from '@/models/sqlite/emailOutboxTable'
import { accountEmailIntent } from '@/utils/email-job.utils'
import { EMAIL } from '@/constants/email'
import type {
  PasswordResetTokenUpdate,
  User,
  UserInsert,
  UserLookupField,
  UserRegistrationInsert,
  UserUpdate,
} from '@/types'

/** Include soft-deleted accounts because they can be restored. */
export async function getImageUrls(): Promise<(string | null)[]> {
  const records = await sqlite
    .select({ avatar: usersTable.avatar })
    .from(usersTable)

  return records.map((record) => record.avatar)
}

export async function getActiveUserBy(
  field: UserLookupField,
  value: string | number,
): Promise<User | null> {
  const [user] = await sqlite
    .select()
    .from(usersTable)
    .where(and(eq(usersTable[field], value), isNull(usersTable.deletedAt)))
    .limit(1)

  return user ?? null
}

/** Soft-deleted accounts continue to reserve their email address. */
export async function emailExists(email: string): Promise<boolean> {
  const [user] = await sqlite
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1)

  return Boolean(user)
}

export async function createUser(values: UserInsert): Promise<User | null> {
  const [user] = await sqlite.insert(usersTable).values(values).returning()

  return user ?? null
}

export async function createUserWithVerification(
  values: UserRegistrationInsert,
): Promise<User | null> {
  return sqlite.transaction((tx) => {
    const [user] = tx.insert(usersTable).values(values).returning().all()

    if (user) {
      tx.insert(emailOutboxTable)
        .values(accountEmailIntent(EMAIL.verification.type, user))
        .run()
    }

    return user ?? null
  })
}

export async function updateUserBy(
  field: UserLookupField,
  value: string | number,
  fields: UserUpdate,
): Promise<User | null> {
  const [user] = await sqlite
    .update(usersTable)
    .set(fields)
    .where(and(eq(usersTable[field], value), isNull(usersTable.deletedAt)))
    .returning()

  return user ?? null
}

export async function setPasswordResetToken(
  uuid: string,
  reset: PasswordResetTokenUpdate,
): Promise<User | null> {
  return sqlite.transaction((tx) => {
    const [user] = tx
      .update(usersTable)
      .set({
        passwordResetToken: reset.token,
        passwordResetExpires: reset.expiresAt,
      })
      .where(and(eq(usersTable.uuid, uuid), isNull(usersTable.deletedAt)))
      .returning()
      .all()

    if (user) {
      tx.insert(emailOutboxTable)
        .values(accountEmailIntent(EMAIL.passwordReset.type, user))
        .run()
    }

    return user ?? null
  })
}

/** Verify only while this token is current and unexpired, consuming it once. */
export async function verifyUserByToken(token: string): Promise<User | null> {
  const [user] = await sqlite
    .update(usersTable)
    .set({ verified: true, verificationToken: null, verificationExpires: null })
    .where(
      and(
        eq(usersTable.verificationToken, token),
        gt(usersTable.verificationExpires, new Date()),
        isNull(usersTable.deletedAt),
      ),
    )
    .returning()

  return user ?? null
}

/** Change the password and consume its reset token in the same conditional write. */
export async function resetPasswordByToken(
  token: string,
  password: string,
): Promise<User | null> {
  const [user] = await sqlite
    .update(usersTable)
    .set({ password, passwordResetToken: null, passwordResetExpires: null })
    .where(
      and(
        eq(usersTable.passwordResetToken, token),
        gt(usersTable.passwordResetExpires, new Date()),
        isNull(usersTable.deletedAt),
      ),
    )
    .returning()

  return user ?? null
}

export async function getAllUsers(): Promise<User[]> {
  const users = await sqlite.select().from(usersTable)

  return users
}

export async function setUsersDeleted(
  userIds: number[],
  deleted: boolean,
): Promise<number> {
  const rows = await sqlite
    .update(usersTable)
    .set({ deletedAt: deleted ? new Date() : null })
    .where(
      and(
        inArray(usersTable.id, userIds),
        deleted
          ? isNull(usersTable.deletedAt)
          : isNotNull(usersTable.deletedAt),
      ),
    )
    .returning({ id: usersTable.id })

  return rows.length
}

export async function cleanupExpiredPasswordResetTokens(): Promise<number> {
  const rows = sqlite
    .update(usersTable)
    .set({
      passwordResetToken: null,
      passwordResetExpires: null,
    })
    .where(lt(usersTable.passwordResetExpires, new Date()))
    .returning({ id: usersTable.id })
    .all()

  return rows.length
}

export async function cleanupUnverifiedUsers(): Promise<
  Pick<User, 'id' | 'email'>[]
> {
  const rows = sqlite
    .update(usersTable)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(usersTable.verified, false),
        isNull(usersTable.deletedAt),
        lt(usersTable.verificationExpires, new Date()),
      ),
    )
    .returning({ id: usersTable.id, email: usersTable.email })
    .all()

  return rows
}
