import { authorsDB } from '@/repositories'
import { validate, idSchema } from '@/validation'

export async function getAuthorsByName(name: string) {
  return authorsDB.getAuthorsBySearch(name)
}

export async function getAuthorById(id: number) {
  const validatedId = validate(idSchema, id)
  return authorsDB.getAuthorById(validatedId)
}
