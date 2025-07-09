import { getTableName } from 'drizzle-orm'
import { db } from '../../db'
import { usersTable } from '../../repositories'
import { env } from '../../config'
import { UserRole } from '../../types'

export async function seedUsers() {
  const admin: typeof usersTable.$inferInsert = {
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

  await db.insert(usersTable).values(admin)

  return {
    [getTableName(usersTable)]: admin.email,
  }
}
