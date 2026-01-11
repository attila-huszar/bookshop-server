import { env } from '@/config'
import type { getHighestId } from '@/models/mongo'
import { DB_REPO, defaultCountry } from '@/constants'
import { type UserInsert, UserRole } from '@/types'

type ModelWithId = Parameters<typeof getHighestId>[0]

const admin: UserInsert = {
  uuid: crypto.randomUUID(),
  firstName: 'Admin',
  lastName: 'Admin',
  email: env.adminEmail!,
  password: Bun.password.hashSync(env.adminPassword!),
  role: UserRole.Admin,
  verified: true,
  country: defaultCountry,
  address: {
    line1: '',
    line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  },
  phone: '',
  avatar: '',
  verificationToken: '',
  verificationExpires: '',
  passwordResetToken: '',
  passwordResetExpires: '',
}

export async function seedUsers() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { usersTable } = await import('@/models/sqlite')
    const { db } = await import('@/db')

    await db.insert(usersTable).values(admin)

    return {
      [getTableName(usersTable)]: admin.email,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { UserModel, getHighestId, setSequence } =
      await import('@/models/mongo')

    const { id, createdAt, updatedAt, ...adminData } = admin
    const createdUser = await UserModel.create(adminData)
    const highestId = await getHighestId(UserModel as ModelWithId)
    await setSequence(UserModel as ModelWithId, highestId)

    return {
      [UserModel.collection.collectionName]: createdUser.email,
    }
  }
}
