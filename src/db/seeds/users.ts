import { getTableName } from 'drizzle-orm'
import { db } from '../sqlite'
import { usersTable } from '../schema'

export async function seedUsers() {
  const user: typeof usersTable.$inferInsert = {
    name: 'Admin',
    role: 'admin',
    email: 'admin@example.com',
  }

  const { changes } = (await db.insert(usersTable).values(user)) as unknown as {
    changes: number
  }

  return {
    [getTableName(usersTable)]: changes,
  }
}
