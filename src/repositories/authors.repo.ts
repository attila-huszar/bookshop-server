import { eq, like } from 'drizzle-orm'
import { authorsTable } from './repoHandler'
import { db } from '../db'
import type { AuthorResponse } from '../types'

const { id, name } = authorsTable

export async function getAuthorById(authorId: number): Promise<AuthorResponse> {
  const authorRecords = await db
    .select({
      id,
      name,
    })
    .from(authorsTable)
    .where(eq(authorsTable.id, authorId))
    .limit(1)

  if (!authorRecords.length) {
    throw new Error('Author does not exist')
  }

  return authorRecords[0]
}

export async function getAuthorsBySearch(
  searchString: string,
): Promise<AuthorResponse[]> {
  const authorRecords = await db
    .select({
      id,
      name,
    })
    .from(authorsTable)
    .where(like(name, `%${searchString}%`))

  return authorRecords
}
