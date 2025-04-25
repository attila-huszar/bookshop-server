import { authorsDB } from '../repositories'

export async function getAuthorsByName(name: string) {
  return authorsDB.getAuthorsBySearch(name)
}

export async function getAuthorById(id: number) {
  return authorsDB.getAuthorById(id)
}
