import { getTableName } from 'drizzle-orm'
import { db } from '../../db'
import { usersTable } from '../schema'

export async function seedUsers() {
  if (!Bun.env.ADMIN_PASSWORD) {
    return {
      [getTableName(usersTable)]: 'Admin not set: ADMIN_PASSWORD missing',
    }
  }

  const admin: typeof usersTable.$inferInsert = {
    uuid: crypto.randomUUID(),
    firstName: 'Admin',
    lastName: 'Admin',
    password: Bun.password.hashSync(Bun.env.ADMIN_PASSWORD),
    role: 'admin',
    email: 'admin@bookshop.com',
    verified: true,
    createdAt: new Date().toISOString(),
  }

  await db.insert(usersTable).values(admin)

  return {
    [getTableName(usersTable)]: admin.email,
  }
}
