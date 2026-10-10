import { eq, inArray, like } from 'drizzle-orm'
import { sqlite } from '@/db'
import { authorsTable } from '@/models/sqlite'
import { NotFound } from '@/errors'
import type {
  Author,
  AuthorInsert,
  AuthorReference,
  AuthorUpdate,
} from '@/types'

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
    throw new NotFound('Author does not exist')
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
): Promise<Author | null> {
  const [updatedAuthor] = await sqlite
    .update(authorsTable)
    .set(updates)
    .where(eq(authorsTable.id, authorId))
    .returning()

  return updatedAuthor ?? null
}

export async function hardDeleteAuthors(
  authorIds: number[],
): Promise<Author['id'][]> {
  await sqlite.delete(authorsTable).where(inArray(authorsTable.id, authorIds))

  return authorIds
}
