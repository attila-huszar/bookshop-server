import model from '@/models'
import type { User, UserInsert, UserRole, UserUpdate } from '@/types'

const { UserModel } = model as MongoModel

type UserRetrieveBy = Extract<
  keyof User,
  'id' | 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken'
>

export async function getUserBy(
  field: UserRetrieveBy,
  value: string | number,
): Promise<User | null> {
  const user = await UserModel.findOne({ [field]: value }).lean()
  if (!user) return null

  return {
    ...user,
    id: user.id!,
    role: user.role as UserRole,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

export async function createUser(user: UserInsert): Promise<User | null> {
  const { id, createdAt, updatedAt, ...userData } = user
  const created = await UserModel.create(userData)
  const userObj = created.toObject()
  return {
    ...userObj,
    id: userObj.id!,
    role: userObj.role as UserRole,
    createdAt: userObj.createdAt.toISOString(),
    updatedAt: userObj.updatedAt.toISOString(),
  }
}

export async function updateUserBy(
  field: UserRetrieveBy,
  value: string | number,
  fields: UserUpdate,
): Promise<User | null> {
  const updated = await UserModel.findOneAndUpdate({ [field]: value }, fields, {
    new: true,
  }).lean()
  if (!updated) return null

  return {
    ...updated,
    id: updated.id!,
    role: updated.role as UserRole,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function getAllUsers(): Promise<User[]> {
  const users = await UserModel.find().lean()
  return users.map((user) => ({
    ...user,
    id: user.id!,
    role: user.role as UserRole,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }))
}

export async function deleteUserByEmail(
  email: string,
): Promise<User['email'] | null> {
  const deleteResult = await UserModel.deleteOne({ email }).lean()

  if (deleteResult.deletedCount === 0) return null
  return email
}

export async function deleteUsersByIds(
  userIds: number[],
): Promise<User['id'][]> {
  await UserModel.deleteMany({ id: { $in: userIds } })

  return userIds
}

export async function cleanupExpiredTokens() {
  const now = new Date().toISOString()

  const usersToDelete = await UserModel.find({
    verificationExpires: { $lt: now },
  }).lean()

  await UserModel.deleteMany({
    verificationExpires: { $lt: now },
  })

  const usersToUpdate = await UserModel.find({
    passwordResetExpires: { $lt: now },
  }).lean()

  await UserModel.updateMany(
    {
      passwordResetExpires: { $lt: now },
    },
    {
      $unset: {
        passwordResetToken: '',
        passwordResetExpires: '',
      },
    },
  )

  return {
    deletedUsers: usersToDelete,
    updatedUsers: usersToUpdate,
  }
}
