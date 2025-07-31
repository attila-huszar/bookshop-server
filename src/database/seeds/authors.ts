import { getTableName } from 'drizzle-orm'
import { db } from '@/db'
import { authorsTable } from '@/models/sqlite'
import { AuthorModel, getHighestId, setSequence } from '@/models/mongo'
import { env } from '@/config'
import { DB_REPO } from '@/constants'
import type { AuthorInsert } from '@/types'
import authorsData from './authors.json'

export async function seedAuthors() {
  const seedValues: AuthorInsert[] = authorsData.map((author) => ({
    id: author.id,
    name: author.name,
    fullName: author.fullName,
    birthYear: author.birthYear,
    deathYear: author.deathYear,
    homeland: author.homeland,
    biography: author.biography,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  if (env.dbRepo === DB_REPO.SQLITE) {
    await db.insert(authorsTable).values(seedValues)

    return {
      [getTableName(authorsTable)]: seedValues.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    await AuthorModel.create(seedValues)
    const highestId = await getHighestId(AuthorModel)
    await setSequence(AuthorModel, highestId)

    return {
      [AuthorModel.collection.collectionName]: seedValues.length,
    }
  }
}
