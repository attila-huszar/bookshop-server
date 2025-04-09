import { getTableName } from 'drizzle-orm'
import { db } from '../../db'
import { users } from '../../repository'
import { env } from '../../config'

export async function seedUsers() {
  const admin: typeof users.$inferInsert = {
    uuid: crypto.randomUUID(),
    firstName: 'Admin',
    lastName: 'Admin',
    password: Bun.password.hashSync(env.adminPassword!),
    role: 'admin',
    email: 'admin@bookshop.com',
    verified: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.insert(users).values(admin)

  return {
    [getTableName(users)]: admin.email,
  }
}
