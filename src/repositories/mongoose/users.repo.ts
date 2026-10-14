import { EmailOutboxModel, UserModel } from '@/models/mongo'
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

export async function getActiveUserBy(
  field: UserLookupField,
  value: string | number,
): Promise<User | null> {
  const user = await UserModel.findOne({
    [field]: value,
    deletedAt: null,
  })
    .lean()
    .exec()

  if (!user) {
    return null
  }

  return user
}

/** Soft-deleted accounts continue to reserve their email address. */
export async function emailExists(email: string): Promise<boolean> {
  const user = await UserModel.exists({ email }).exec()

  return Boolean(user)
}

export async function createUser(user: UserInsert): Promise<User | null> {
  const { id, createdAt, updatedAt, ...userData } = user

  // Keep numeric ID allocation and the user insert in the same transaction.
  return await UserModel.db.transaction(async (session) => {
    const [created] = await UserModel.create([userData], { session })

    return created?.toObject() ?? null
  })
}

export async function createUserWithVerification(
  user: UserRegistrationInsert,
): Promise<User | null> {
  const { id, createdAt, updatedAt, ...userData } = user

  return await UserModel.db.transaction(async (session) => {
    const [created] = await UserModel.create([userData], { session })

    if (!created) {
      return null
    }

    const savedUser = created.toObject()

    await EmailOutboxModel.insertMany(
      [accountEmailIntent(EMAIL.verification.type, savedUser)],
      { session },
    )

    return savedUser
  })
}

export async function updateUserBy(
  field: UserLookupField,
  value: string | number,
  fields: UserUpdate,
): Promise<User | null> {
  const user = await UserModel.findOneAndUpdate(
    { [field]: value, deletedAt: null },
    fields,
    {
      returnDocument: 'after',
    },
  )
    .lean()
    .exec()

  return user ?? null
}

export async function setPasswordResetToken(
  uuid: string,
  reset: PasswordResetTokenUpdate,
): Promise<User | null> {
  return await UserModel.db.transaction(async (session) => {
    const user = await UserModel.findOneAndUpdate(
      { uuid, deletedAt: null },
      {
        passwordResetToken: reset.token,
        passwordResetExpires: reset.expiresAt,
      },
      { returnDocument: 'after', session },
    )
      .lean()
      .exec()

    if (user) {
      await EmailOutboxModel.insertMany(
        [accountEmailIntent(EMAIL.passwordReset.type, user)],
        { session },
      )
    }

    return user ?? null
  })
}

export async function getAllUsers(): Promise<User[]> {
  const users = await UserModel.find().lean().exec()

  return users
}

export async function setUsersDeleted(
  userIds: number[],
  deleted: boolean,
): Promise<number> {
  const result = await UserModel.updateMany(
    { id: { $in: userIds }, deletedAt: deleted ? null : { $ne: null } },
    { $set: { deletedAt: deleted ? new Date() : null } },
  ).exec()

  return result.modifiedCount
}

export async function cleanupExpiredPasswordResetTokens(): Promise<number> {
  const now = new Date()

  const result = await UserModel.updateMany(
    { passwordResetExpires: { $lt: now } },
    { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } },
  ).exec()

  return result.modifiedCount
}

export async function cleanupUnverifiedUsers(): Promise<
  Pick<User, 'id' | 'email'>[]
> {
  const now = new Date()
  const filter = {
    verified: false,
    verificationExpires: { $lt: now },
    deletedAt: null,
  }

  return await UserModel.db.transaction(async (session) => {
    const users = await UserModel.find(
      filter,
      { id: 1, email: 1, _id: 0 },
      { session },
    )
      .lean()
      .exec()

    if (users.length === 0) {
      return []
    }

    const result = await UserModel.updateMany(
      { ...filter, id: { $in: users.map((user) => user.id) } },
      { $set: { deletedAt: now } },
      { session },
    ).exec()

    if (result.modifiedCount !== users.length) {
      throw new Error(
        'Expired user cleanup changed an unexpected number of accounts',
      )
    }

    return users.map((user) => ({ id: user.id, email: user.email }))
  })
}
