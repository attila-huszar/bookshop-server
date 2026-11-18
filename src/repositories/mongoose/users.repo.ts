import { type ClientSession, mongo } from 'mongoose'
import { EmailOutboxModel, UserModel } from '@/models/mongo'
import { accountEmailIntent } from '@/utils/emailOutbox.utils'
import { MONGO_DUPLICATE_KEY_CODE } from '@/constants/database'
import { EMAIL } from '@/constants/email'
import type {
  PasswordResetTokenUpdate,
  User,
  UserInsert,
  UserLookupField,
  UserRegistrationInsert,
  UserUpdate,
} from '@/types'
import { UserErrorCode, UserRole } from '@/types/enums'

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

/** Verify only while this token is current and unexpired, consuming it once. */
export async function verifyUserByToken(token: string): Promise<User | null> {
  const user = await UserModel.findOneAndUpdate(
    {
      verificationToken: token,
      verificationExpires: { $gt: new Date() },
      deletedAt: null,
    },
    { verified: true, verificationToken: null, verificationExpires: null },
    { returnDocument: 'after' },
  )
    .lean()
    .exec()

  return user ?? null
}

/** Link only a verified account that has not already chosen a Google identity. */
export async function linkGoogleAccount(
  uuid: string,
  googleSubject: string,
): Promise<User | null> {
  const user = await UserModel.findOneAndUpdate(
    { uuid, verified: true, googleSubject: null, deletedAt: null },
    { $set: { googleSubject } },
    { returnDocument: 'after' },
  )
    .lean()
    .exec()

  return user ?? null
}

export function getUserIdentityConflict(error: unknown) {
  if (
    !(error instanceof mongo.MongoServerError) ||
    error.code !== MONGO_DUPLICATE_KEY_CODE
  ) {
    return undefined
  }

  const keyPattern: unknown = error.errorResponse.keyPattern

  if (!keyPattern || typeof keyPattern !== 'object') {
    return undefined
  }

  const keys = Object.keys(keyPattern)
  const [field] = keys

  if (keys.length === 1 && (field === 'email' || field === 'googleSubject')) {
    return field
  }

  return undefined
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

/** Change the password and consume its reset token in the same conditional write. */
export async function resetPasswordByToken(
  token: string,
  password: string,
): Promise<User | null> {
  const user = await UserModel.findOneAndUpdate(
    {
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
      deletedAt: null,
    },
    { password, passwordResetToken: null, passwordResetExpires: null },
    { returnDocument: 'after' },
  )
    .lean()
    .exec()

  return user ?? null
}

export async function getAllUsers(): Promise<User[]> {
  const users = await UserModel.find().lean().exec()

  return users
}

export async function updateUserBy(
  field: UserLookupField,
  value: string | number,
  fields: UserUpdate,
): Promise<User | null | UserErrorCode.LastAdminRequired> {
  const updates =
    fields.verified === true
      ? { ...fields, verificationToken: null, verificationExpires: null }
      : fields

  const saveUser = async (session?: ClientSession): Promise<User | null> => {
    const user = await UserModel.findOneAndUpdate(
      { [field]: value, deletedAt: null },
      updates,
      { returnDocument: 'after', ...(session ? { session } : {}) },
    )
      .lean()
      .exec()

    return user ?? null
  }

  if (fields.role !== UserRole.User) {
    return await saveUser()
  }

  return await UserModel.db.transaction(async (session) => {
    const filter = { role: UserRole.Admin, deletedAt: null }

    // Share writes with deletion so concurrent removals cannot each remove an admin.
    await UserModel.updateMany(
      filter,
      { $inc: { __v: 1 } },
      { session, timestamps: false },
    ).exec()

    const admins = await UserModel.find(filter).session(session).lean().exec()
    const removingAdminCount = admins.filter(
      (admin) => admin[field] === value,
    ).length

    if (removingAdminCount > 0 && removingAdminCount >= admins.length) {
      return UserErrorCode.LastAdminRequired
    }

    return await saveUser(session)
  })
}

export async function setUsersDeleted(
  userIds: number[],
  deleted: boolean,
): Promise<number | UserErrorCode.LastAdminRequired> {
  const saveDeletedState = async (session?: ClientSession) => {
    const result = await UserModel.updateMany(
      { id: { $in: userIds }, deletedAt: deleted ? null : { $ne: null } },
      { $set: { deletedAt: deleted ? new Date() : null } },
      session ? { session } : undefined,
    ).exec()

    return result.modifiedCount
  }

  if (!deleted) {
    return await saveDeletedState()
  }

  return await UserModel.db.transaction(async (session) => {
    const filter = { role: UserRole.Admin, deletedAt: null }

    // Share writes with demotion so concurrent removals cannot each remove an admin.
    await UserModel.updateMany(
      filter,
      { $inc: { __v: 1 } },
      { session, timestamps: false },
    ).exec()

    const admins = await UserModel.find(filter).session(session).lean().exec()
    const removingAdminCount = admins.filter((admin) =>
      userIds.includes(admin.id),
    ).length

    if (removingAdminCount > 0 && removingAdminCount >= admins.length) {
      return UserErrorCode.LastAdminRequired
    }

    return await saveDeletedState(session)
  })
}

/** Include soft-deleted accounts because they can be restored. */
export async function getImageUrls(): Promise<(string | null)[]> {
  const records = await UserModel.find().select({ avatar: 1 }).lean().exec()

  return records.map((record) => record.avatar ?? null)
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
