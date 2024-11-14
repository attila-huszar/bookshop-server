import { getTableName } from 'drizzle-orm'
import { db } from '../../db'
import { users } from '../../repository'

export async function seedUsers() {
  if (!Bun.env.ADMIN_PASSWORD) {
    return {
      [getTableName(users)]: 'Admin not set: ADMIN_PASSWORD missing',
    }
  }

  const admin: typeof users.$inferInsert = {
    uuid: crypto.randomUUID(),
    firstName: 'Admin',
    lastName: 'Admin',
    password: Bun.password.hashSync(Bun.env.ADMIN_PASSWORD),
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
