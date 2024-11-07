import { getTableName } from 'drizzle-orm'
import { db } from '../../db'
import { authorsTable } from '../schema'
import authorsData from './authors.json'

export async function seedAuthors() {
  const authors: (typeof authorsTable.$inferInsert)[] = authorsData.map(
    (author) => ({
      id: author.id,
      name: author.name,
      fullName: author.fullName,
      birthYear: author.birthYear,
      deathYear: author.deathYear,
      homeland: author.homeland,
      biography: author.biography,
      createdAt: new Date().toISOString(),
    }),
  )

  await db.insert(authorsTable).values(authors)

  return {
    [getTableName(authorsTable)]: authors.length,
  }
}