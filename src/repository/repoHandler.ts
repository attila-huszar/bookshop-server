import * as sqlite from '../database/schema/sqlite'

const repoHandlers = {
  SQLITE: sqlite,
}

const repo = Bun.env.DB_REPO as keyof typeof repoHandlers

const selectedRepo = repoHandlers[repo]

if (!selectedRepo) {
  throw new Error(`Unknown DB Repository choice: ${repo}`)
}

export const {
  booksTable: books,
  authorsTable: authors,
  usersTable: users,
} = selectedRepo
