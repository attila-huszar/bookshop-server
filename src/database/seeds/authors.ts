import { env } from '@/config/env'
import { DB_REPO } from '@/types/enums'
import authorsData from './authors.json'
import { seedMongo } from './mongo'
import { seedSqlite } from './sqlite'

export async function seedAuthors() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { authorsTable } = await import('@/models/sqlite')

    return {
      [getTableName(authorsTable)]: await seedSqlite(authorsTable, authorsData),
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { AuthorModel } = await import('@/models/mongo/AuthorModel')

    return {
      [AuthorModel.collection.collectionName]: await seedMongo(
        AuthorModel,
        authorsData,
      ),
    }
  }
}
