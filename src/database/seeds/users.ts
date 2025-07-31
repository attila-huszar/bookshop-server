import { env } from '@/config'
import { DB_REPO } from '@/constants'
import { UserRole, type UserInsert } from '@/types'

const admin: UserInsert = {
  id: 1,
  uuid: crypto.randomUUID(),
  firstName: 'Admin',
  lastName: 'Admin',
  email: env.adminEmail!,
  password: Bun.password.hashSync(env.adminPassword!),
  role: UserRole.Admin,
  verified: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
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
    const { UserModel, getHighestId, setSequence } = await import(
      '@/models/mongo'
    )

    const createdUser = await UserModel.create(admin)
    const highestId = await getHighestId(UserModel)
    await setSequence(UserModel, highestId)

    return {
      [UserModel.collection.collectionName]: createdUser.email,
    }
  }
}
