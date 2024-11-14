import { eq, like } from 'drizzle-orm'
import { authors } from './repoHandler'
import { db } from '../db'
import type { AuthorResponse } from '../types'

const { id, name } = authors

export async function getAuthorById(authorId: number): Promise<AuthorResponse> {
  try {
    const authorRecord = await db
      .select({
        id,
        name,
      })
      .from(authors)
      .where(eq(authors.id, authorId))

    return authorRecord[0]
  } catch (error) {
    throw new Error('DB Error: Author not found by id')
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
    throw new Error('DB Error: Authors not found by search')
  }
}
