import { env } from '@/config'
import { DB_REPO } from '@/types/enums'

let dbModel: DBModel

if (env.dbRepo === DB_REPO.MONGO) {
  dbModel = await import('./mongo')
} else {
  dbModel = await import('./sqlite')
}

export default dbModel
