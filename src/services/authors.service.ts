import { authorsDB } from '@/repositories'
import { idSchema, validate } from '@/validation'
import type { AuthorReference } from '@/types'

export async function getAuthorsByName(
  name: string,
): Promise<AuthorReference[]> {
  return authorsDB.getAuthorsBySearch(name)
}

export async function getAuthorById(id: number): Promise<AuthorReference> {
  const validatedId = validate(idSchema, id)
  return authorsDB.getAuthorById(validatedId)
}
