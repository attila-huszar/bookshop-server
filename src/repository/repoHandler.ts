import * as sqlite from '../database/schema/sqlite'
import { env } from '../config'

const repoHandlers = {
  SQLITE: sqlite,
}

const repo = env.dbRepo as keyof typeof repoHandlers

const selectedRepo = repoHandlers[repo]

if (!selectedRepo) {
  throw new Error(`Unknown DB Repository: ${repo}`)
}

export const {
  booksTable: books,
  authorsTable: authors,
  usersTable: users,
  newsTable: news,
} = selectedRepo
