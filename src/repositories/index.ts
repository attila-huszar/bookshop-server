import { env } from '@/config'
import { DB_REPO } from '@/types/enums'

const repository =
  env.dbRepo === DB_REPO.MONGO
    ? await import('./mongoose')
    : await import('./drizzle')

export const { authorsDB, booksDB, newsDB, ordersDB, usersDB } = repository
