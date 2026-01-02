import { env } from '@/config'
import { DB_REPO } from '@/constants'
import authorsData from './authors.json'
import type { AuthorInsert } from '@/types'

export async function seedAuthors() {
  const seedValues: AuthorInsert[] = authorsData.map((author) => ({
    id: author.id,
    name: author.name,
    fullName: author.fullName,
    birthYear: author.birthYear,
    deathYear: author.deathYear,
    homeland: author.homeland,
    biography: author.biography,
  }))

  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { authorsTable } = await import('@/models/sqlite')
    const { db } = await import('@/db')

    await db.insert(authorsTable).values(seedValues)

    return {
      [getTableName(authorsTable)]: seedValues.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { AuthorModel, getHighestId, setSequence } =
      await import('@/models/mongo')

    await AuthorModel.create(seedValues)
    const highestId = await getHighestId(AuthorModel)
    await setSequence(AuthorModel, highestId)

    return {
      [AuthorModel.collection.collectionName]: seedValues.length,
    }
  }
}
