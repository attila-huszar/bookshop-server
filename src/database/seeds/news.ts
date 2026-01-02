import { env } from '@/config'
import { DB_REPO } from '@/constants'
import newsData from './news.json'
import type { NewsInsert } from '@/types'

export async function seedNews() {
  const seedValues: NewsInsert[] = newsData.map((news) => ({
    id: news.id,
    title: news.title,
    content: news.content,
    img: news.img,
  }))

  if (env.dbRepo === DB_REPO.SQLITE) {
    const { getTableName } = await import('drizzle-orm')
    const { newsTable } = await import('@/models/sqlite')
    const { db } = await import('@/db')

    await db.insert(newsTable).values(seedValues)

    return {
      [getTableName(newsTable)]: seedValues.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    const { NewsModel, getHighestId, setSequence } =
      await import('@/models/mongo')

    await NewsModel.create(seedValues)
    const highestId = await getHighestId(NewsModel)
    await setSequence(NewsModel, highestId)

    return {
      [NewsModel.collection.collectionName]: seedValues.length,
    }
  }
}
