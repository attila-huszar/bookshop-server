import { getTableName } from 'drizzle-orm'
import { db } from '@/db'
import { newsTable } from '@/models/sqlite'
import { NewsModel, resetCounterFromCollection } from '@/models/mongo'
import { env } from '@/config'
import { DB_REPO } from '@/constants'
import type { NewsInsert } from '@/types'
import newsData from './news.json'

export async function seedNews() {
  const seedValues: NewsInsert[] = newsData.map((news) => ({
    id: news.id,
    title: news.title,
    content: news.content,
    img: news.img,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  if (env.dbRepo === DB_REPO.SQLITE) {
    await db.insert(newsTable).values(seedValues)

    return {
      [getTableName(newsTable)]: seedValues.length,
    }
  }

  if (env.dbRepo === DB_REPO.MONGO) {
    await NewsModel.create(seedValues)
    await resetCounterFromCollection('News', 'id')

    return {
      [NewsModel.collection.collectionName]: seedValues.length,
    }
  }
}
