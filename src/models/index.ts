import { env } from '@/config'
import { DB_REPO } from '@/constants'

let dbModel: DBModel

if (env.dbRepo === DB_REPO.MONGO) {
  dbModel = await import('./mongo')
} else {
  dbModel = await import('./sqlite')
}

export default dbModel
