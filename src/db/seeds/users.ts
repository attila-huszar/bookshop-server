import { getTableName } from 'drizzle-orm'
import { db } from '../../db'
import { usersTable } from '../schema'

export async function seedUsers() {
  const user: typeof usersTable.$inferInsert = {
    uuid: crypto.randomUUID(),
    firstName: 'Admin',
    lastName: 'Admin',
    password: Bun.password.hashSync('admin'),
    role: 'admin',
    email: 'admin@bookshop.com',
    verified: true,
    createdAt: new Date().toISOString(),
  }

  const { changes } = (await db.insert(usersTable).values(user)) as unknown as {
    changes: number
  }

  return {
    [getTableName(usersTable)]: changes,
  }
}
