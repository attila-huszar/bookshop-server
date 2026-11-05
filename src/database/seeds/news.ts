import { env } from '@/config/env'
import { DB_REPO } from '@/types/enums'
import { seedMongo } from './mongo'
import newsData from './news.json'
import { seedSqlite } from './sqlite'

export async function seedNews() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { newsTable } = await import('@/models/sqlite')

    return {
      [getTableName(newsTable)]: await seedSqlite(newsTable, newsData),
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { NewsModel } = await import('@/models/mongo/NewsModel')

    return {
      [NewsModel.collection.collectionName]: await seedMongo(
        NewsModel,
        newsData,
      ),
    }
  }
}
