import { getTableName } from 'drizzle-orm'
import { db } from '@/db'
import { authorsTable } from '@/models/sqlite'
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  await db.insert(authorsTable).values(seedValues)

  return {
    [getTableName(authorsTable)]: seedValues.length,
  }
}
