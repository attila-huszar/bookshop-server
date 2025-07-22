import { eq, like } from 'drizzle-orm'
import { authorsTable } from './repoHandler'
import { db } from '@/db'
import type { Author, AuthorCreate, AuthorReference } from '@/types'

const { id, name } = authorsTable

export async function getAuthorById(
  authorId: number,
): Promise<AuthorReference> {
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
): Promise<AuthorReference[]> {
  const authorRecords = await db
    .select({
      id,
      name,
    })
    .from(authorsTable)
    .where(like(name, `%${searchString}%`))

  return authorRecords
}

export async function getAllAuthors(): Promise<Author[]> {
  const authorRecords = await db.select().from(authorsTable)
  return authorRecords
}

export async function insertAuthor(author: AuthorCreate): Promise<Author> {
  const [newAuthor] = await db.insert(authorsTable).values(author).returning()

  return newAuthor
}
