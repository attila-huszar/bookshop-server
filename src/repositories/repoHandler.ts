import * as sqlite from '../database/schema/sqlite'
import { env } from '../config'

const repoHandlers = {
  SQLITE: sqlite,
}

const repo = env.dbRepo as keyof typeof repoHandlers

if (!repoHandlers[repo]) {
  throw new Error(`Unknown DB Repository: ${repo}`)
}

export const { booksTable, authorsTable, usersTable, newsTable, ordersTable } =
  repoHandlers[repo]
