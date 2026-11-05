import { env } from '@/config/env'
import { defaultCountry } from '@/constants/localization'
import { DB_REPO, type UserInsert, UserRole } from '@/types'

function createAdmin(): UserInsert {
  return {
    uuid: crypto.randomUUID(),
    firstName: 'Admin',
    lastName: 'Admin',
    email: env.adminEmail!.trim().toLowerCase(),
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
}

function assertExistingAdmin(user: {
  role: UserRole
  deletedAt?: Date | null
}) {
  if (user.role !== UserRole.Admin || user.deletedAt) {
    throw new Error(
      'ADMIN_EMAIL belongs to an existing non-admin or deleted account. Choose another email; setup will not change this account.',
    )
  }
}

export async function seedUsers() {
  const email = env.adminEmail!.trim().toLowerCase()

  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName, sql } = await import('drizzle-orm')
    const { usersTable } = await import('@/models/sqlite')
    const { sqlite } = await import('@/database/sqlite')

    const existing = sqlite
      .select({ role: usersTable.role, deletedAt: usersTable.deletedAt })
      .from(usersTable)
      .where(sql`lower(${usersTable.email}) = ${email}`)
      .get()

    if (existing) {
      assertExistingAdmin(existing)
    } else {
      await sqlite.insert(usersTable).values(createAdmin())
    }

    return {
      [getTableName(usersTable)]: {
        inserted: existing ? 0 : 1,
        existing: existing ? 1 : 0,
      },
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { UserModel } = await import('@/models/mongo/UserModel')
    const { getHighestId, setSequence } =
      await import('@/models/mongo/plugins/autoIncrement')

    const existing = await UserModel.findOne({ email })
      .collation({ locale: 'en', strength: 2 })
      .select({ role: true, deletedAt: true })
      .lean()

    if (existing) {
      assertExistingAdmin(existing)
    }

    // Repair a missing/stale counter before allocating the new admin's ID.
    await setSequence(UserModel, await getHighestId(UserModel))

    if (!existing) {
      const { id, createdAt, updatedAt, ...adminData } = createAdmin()

      await UserModel.create(adminData)
    }

    return {
      [UserModel.collection.collectionName]: {
        inserted: existing ? 0 : 1,
        existing: existing ? 1 : 0,
      },
    }
  }
}
