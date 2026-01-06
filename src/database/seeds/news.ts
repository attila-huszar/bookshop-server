import { env } from '@/config'
import { DB_REPO } from '@/constants'
import newsData from './news.json'

export async function seedNews() {
  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { newsTable } = await import('@/models/sqlite')
    const { db } = await import('@/db')

    await db.insert(newsTable).values(newsData)

    return {
      [getTableName(newsTable)]: newsData.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { NewsModel, getHighestId, setSequence } =
      await import('@/models/mongo')

    await NewsModel.create(newsData)
    const highestId = await getHighestId(NewsModel)
    await setSequence(NewsModel, highestId)

    return {
      [NewsModel.collection.collectionName]: newsData.length,
    }
  }
}
