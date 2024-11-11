import { eq, like } from 'drizzle-orm'
import { authors } from './repoHandler'
import { db } from '../db'
import type { AuthorResponse } from '../types'

const { id, name } = authors

export async function getAuthorById(authorId: number): Promise<AuthorResponse> {
  const authorRecord = await db
    .select({
      id,
      name,
    })
    .from(authors)
    .where(eq(authors.id, authorId))

  return authorRecord[0]
}

export async function getAuthorsBySearch(
  searchString: string,
): Promise<AuthorResponse[]> {
  const authorRecords = await db
    .select({
      id,
      name,
    })
    .from(authors)
    .where(like(name, `%${searchString}%`))

  return authorRecords
}
