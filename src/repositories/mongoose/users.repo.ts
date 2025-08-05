import { UserModel } from '@/models/mongo'
import type { User, UserInsert, UserUpdateRequest, UserRole } from '@/types'
import type Stripe from 'stripe'

export async function getUserBy(
  field: 'uuid' | 'email' | 'verificationToken' | 'passwordResetToken',
  token: string,
): Promise<User | null> {
  const user = await UserModel.findOne({ [field]: token }).lean()
  if (!user) return null

  return {
    id: user.id!,
    uuid: user.uuid,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as UserRole,
    email: user.email,
    password: user.password,
    address: user.address as Stripe.Address,
    phone: user.phone ?? null,
    avatar: user.avatar ?? null,
    verified: user.verified,
    verificationToken: user.verificationToken ?? null,
    verificationExpires: user.verificationExpires ?? null,
    passwordResetToken: user.passwordResetToken ?? null,
    passwordResetExpires: user.passwordResetExpires ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

export async function createUser(values: UserInsert): Promise<User | null> {
  const created = await UserModel.create(values)
  const savedUser = created.toObject()

  return {
    id: savedUser.id!,
    uuid: savedUser.uuid,
    firstName: savedUser.firstName,
    lastName: savedUser.lastName,
    role: savedUser.role as UserRole,
    email: savedUser.email,
    password: savedUser.password,
    address: savedUser.address as Stripe.Address,
    phone: savedUser.phone ?? null,
    avatar: savedUser.avatar ?? null,
    verified: savedUser.verified,
    verificationToken: savedUser.verificationToken ?? null,
    verificationExpires: savedUser.verificationExpires ?? null,
    passwordResetToken: savedUser.passwordResetToken ?? null,
    passwordResetExpires: savedUser.passwordResetExpires ?? null,
    createdAt: savedUser.createdAt.toISOString(),
    updatedAt: savedUser.updatedAt.toISOString(),
  }
}

export async function updateUser(
  email: string,
  fields: UserUpdateRequest,
): Promise<User | null> {
  const updated = await UserModel.findOneAndUpdate({ email }, fields, {
    new: true,
  }).lean()
  if (!updated) return null

  return {
    id: updated.id!,
    uuid: updated.uuid,
    firstName: updated.firstName,
    lastName: updated.lastName,
    role: updated.role as UserRole,
    email: updated.email,
    password: updated.password,
    address: updated.address as Stripe.Address,
    phone: updated.phone ?? null,
    avatar: updated.avatar ?? null,
    verified: updated.verified,
    verificationToken: updated.verificationToken ?? null,
    verificationExpires: updated.verificationExpires ?? null,
    passwordResetToken: updated.passwordResetToken ?? null,
    passwordResetExpires: updated.passwordResetExpires ?? null,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function getAllUsers(): Promise<User[]> {
  const users = await UserModel.find().lean()

  return users.map((user) => ({
    id: user.id!,
    uuid: user.uuid,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role as UserRole,
    email: user.email,
    password: user.password,
    address: user.address as Stripe.Address,
    phone: user.phone ?? null,
    avatar: user.avatar ?? null,
    verified: user.verified,
    verificationToken: user.verificationToken ?? null,
    verificationExpires: user.verificationExpires ?? null,
    passwordResetToken: user.passwordResetToken ?? null,
    passwordResetExpires: user.passwordResetExpires ?? null,
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
