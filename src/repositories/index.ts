import { env } from '@/config'
import { DB_REPO } from '@/types/enums'

if (env.dbRepo !== DB_REPO.MONGO && env.dbRepo !== DB_REPO.SQLITE) {
  throw new Error('Invalid DB_REPO: expected SQLITE or MONGO')
}

const repository =
  env.dbRepo === DB_REPO.MONGO
    ? await import('./mongoose')
    : await import('./drizzle')

export const {
  authorsDB,
  booksDB,
  newsDB,
  ordersDB,
  usersDB,
  outboxDB,
  termsDB,
} = repository
