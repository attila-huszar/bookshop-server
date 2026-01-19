import { eq, inArray, like, sql } from 'drizzle-orm'
import { sqlite } from '@/db'
import model from '@/models'
import type {
  Author,
  AuthorInsert,
  AuthorReference,
  AuthorUpdate,
} from '@/types'

const { authorsTable } = model as SQLiteModel
const { id, name } = authorsTable

export async function getAuthorById(
  authorId: number,
): Promise<AuthorReference> {
  const authorRecords = await sqlite
    .select({
      id,
      name,
    })
    .from(authorsTable)
    .where(eq(authorsTable.id, authorId))
    .limit(1)

  const authorRecord = authorRecords[0]
  if (!authorRecord) {
    throw new Error('Author does not exist')
  }

  return authorRecord
}

export async function getAuthorsBySearch(
  searchString: string,
): Promise<AuthorReference[]> {
  const authorRecords = await sqlite
    .select({
      id,
      name,
    })
    .from(authorsTable)
    .where(like(name, `%${searchString}%`))

  return authorRecords
}

export async function getAllAuthors(): Promise<Author[]> {
  const authorRecords = await sqlite.select().from(authorsTable)
  return authorRecords
}

export async function insertAuthor(author: AuthorInsert): Promise<Author> {
  const [newAuthor] = await sqlite
    .insert(authorsTable)
    .values(author)
    .returning()
  if (!newAuthor) {
    throw new Error('Failed to create author')
  }
  return newAuthor
}

export async function updateAuthor(
  authorId: number,
  updates: AuthorUpdate,
): Promise<Author> {
  const [updatedAuthor] = await sqlite
    .update(authorsTable)
    .set({
      ...updates,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(authorsTable.id, authorId))
    .returning()

  if (!updatedAuthor) {
    throw new Error('Author does not exist')
  }

  return updatedAuthor
}

export async function deleteAuthors(
  authorIds: number[],
): Promise<Author['id'][]> {
  await sqlite.delete(authorsTable).where(inArray(authorsTable.id, authorIds))

  return authorIds
}
