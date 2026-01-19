import model from '@/models'
import type { GetUserBy, User, UserInsert, UserUpdate } from '@/types'

const { UserModel } = model as MongoModel

export async function getUserBy(
  field: GetUserBy,
  value: string | number,
): Promise<User | null> {
  const user = await UserModel.findOne({ [field]: value })
    .lean()
    .exec()
  if (!user) return null
  return user
}

export async function createUser(user: UserInsert): Promise<User | null> {
  const { id, createdAt, updatedAt, ...userData } = user
  const created = await UserModel.create(userData)
  const userObj = created.toObject()
  return userObj
}

export async function updateUserBy(
  field: GetUserBy,
  value: string | number,
  fields: UserUpdate,
): Promise<User | null> {
  const updatedUsers = await UserModel.findOneAndUpdate(
    { [field]: value },
    fields,
    { new: true },
  )
    .lean()
    .exec()
  if (!updatedUsers) return null
  return updatedUsers
}

export async function getAllUsers(): Promise<User[]> {
  const users = await UserModel.find().lean().exec()
  return users
}

export async function deleteUserBy(
  field: GetUserBy,
  value: string | number,
): Promise<User['email'] | null> {
  const user = await UserModel.findOne({ [field]: value })
    .lean()
    .exec()
  if (!user) return null
  const { email } = user
  const deleteResult = await UserModel.deleteOne({ [field]: value }).exec()
  if (deleteResult.deletedCount === 0) return null
  return email
}

export async function deleteUsersByIds(
  userIds: number[],
): Promise<User['id'][]> {
  await UserModel.deleteMany({ id: { $in: userIds } }).exec()
  return userIds
}

export async function cleanupExpiredPasswordResetTokens(): Promise<User[]> {
  const now = new Date()

  const updatedUsers = await UserModel.find({
    passwordResetExpires: { $lt: now },
  })
    .lean()
    .exec()

  await UserModel.updateMany(
    { passwordResetExpires: { $lt: now } },
    { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } },
  ).exec()

  return updatedUsers
}

export async function cleanupUnverifiedUsers(): Promise<User[]> {
  const now = new Date()

  const deletedUsers = await UserModel.find({
    verified: false,
    verificationExpires: { $lt: now },
  })
    .lean()
    .exec()

  await UserModel.deleteMany({
    verified: false,
    verificationExpires: { $lt: now },
  }).exec()

  return deletedUsers
}
