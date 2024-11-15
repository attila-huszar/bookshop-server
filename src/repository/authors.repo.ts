import { eq, like } from 'drizzle-orm'
import { authors } from './repoHandler'
import { db } from '../db'
import { DBError } from '../errors'
import type { AuthorResponse } from '../types'

const { id, name } = authors

export async function getAuthorById(authorId: number): Promise<AuthorResponse> {
  try {
    const authorRecords = await db
      .select({
        id,
        name,
      })
      .from(authors)
      .where(eq(authors.id, authorId))
      .limit(1)

    if (!authorRecords.length) {
      throw new Error('Author does not exist')
    }

    return authorRecords[0]
  } catch (error) {
    throw new DBError(
      `getAuthorById: ${error instanceof Error && error.message}`,
    )
  }
}

export async function getAuthorsBySearch(
  searchString: string,
): Promise<AuthorResponse[]> {
  try {
    const authorRecords = await db
      .select({
        id,
        name,
      })
      .from(authors)
      .where(like(name, `%${searchString}%`))

    return authorRecords
  } catch (error) {
    throw new DBError(
      `getAuthorsBySearch: ${error instanceof Error && error.message}`,
    )
  }
}
