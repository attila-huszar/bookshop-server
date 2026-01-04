import { eq, inArray, like, sql } from 'drizzle-orm'
import { db } from '@/db'
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

export async function insertAuthor(author: AuthorInsert): Promise<Author> {
  const [newAuthor] = await db.insert(authorsTable).values(author).returning()

  return newAuthor
}

export async function updateAuthor(
  authorId: number,
  updates: AuthorUpdate,
): Promise<Author> {
  const [updatedAuthor] = await db
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
  await db.delete(authorsTable).where(inArray(authorsTable.id, authorIds))

  return authorIds
}
