import { env } from '@/config'
import { DB_REPO } from '@/constants'
import * as drizzleRepo from './drizzle'
import * as mongoRepo from './mongoose'

export const { authorsDB, booksDB, newsDB, ordersDB, usersDB } =
  env.dbRepo === DB_REPO.MONGO ? mongoRepo : drizzleRepo
