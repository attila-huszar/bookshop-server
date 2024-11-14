import { getTableName } from 'drizzle-orm'
import { db } from '../../db'
import { news } from '../../repository'
import newsData from './news.json'

export async function seedNews() {
  const seedValues: (typeof news.$inferInsert)[] = newsData.map((news) => ({
    id: news.id,
    title: news.title,
    content: news.content,
    img: news.img,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  await db.insert(news).values(seedValues)

  return {
    [getTableName(news)]: seedValues.length,
  }
}
