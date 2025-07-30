import { getTableName } from 'drizzle-orm'
import { db } from '@/db'
import { usersTable } from '@/models/sqlite'
import { UserModel, resetCounterFromCollection } from '@/models/mongo'
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
    await db.insert(usersTable).values(admin)

    return {
      [getTableName(usersTable)]: admin.email,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const createdUser = await UserModel.create(admin)
    await resetCounterFromCollection('User', 'id')

    return {
      [UserModel.collection.collectionName]: createdUser.email,
    }
  }
}
