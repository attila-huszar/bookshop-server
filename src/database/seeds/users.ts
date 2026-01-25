import { env } from '@/config'
import { DB_REPO, defaultCountry } from '@/constants'
import { type UserInsert, UserRole } from '@/types'

const admin: UserInsert = {
  uuid: crypto.randomUUID(),
  firstName: 'Admin',
  lastName: 'Admin',
  email: env.adminEmail!,
  password: Bun.password.hashSync(env.adminPassword!),
  role: UserRole.Admin,
  verified: true,
  country: defaultCountry,
  address: null,
  phone: null,
  avatar: null,
  verificationToken: null,
  verificationExpires: null,
  passwordResetToken: null,
  passwordResetExpires: null,
}

export async function seedUsers() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { usersTable } = await import('@/models/sqlite')
    const { sqlite } = await import('@/db')

    await sqlite.insert(usersTable).values(admin)

    return {
      [getTableName(usersTable)]: admin.email,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { UserModel, getHighestId, setSequence } =
      await import('@/models/mongo')

    const { id, createdAt, updatedAt, ...adminData } = admin
    const createdUser = await UserModel.create(adminData)
    const highestId = await getHighestId(UserModel)
    await setSequence(UserModel, highestId)

    return {
      [UserModel.collection.collectionName]: createdUser.email,
    }
  }
}
