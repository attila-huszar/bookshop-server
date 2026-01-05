import { env } from '@/config'
import { DB_REPO } from '@/constants'
import authorsData from './authors.json'

export async function seedAuthors() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { authorsTable } = await import('@/models/sqlite')
    const { db } = await import('@/db')

    await db.insert(authorsTable).values(authorsData)

    return {
      [getTableName(authorsTable)]: authorsData.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { AuthorModel, getHighestId, setSequence } =
      await import('@/models/mongo')

    await AuthorModel.create(authorsData)
    const highestId = await getHighestId(AuthorModel)
    await setSequence(AuthorModel, highestId)

    return {
      [AuthorModel.collection.collectionName]: authorsData.length,
    }
  }
}
