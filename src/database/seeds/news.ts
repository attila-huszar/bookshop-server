import { getTableName } from 'drizzle-orm'
import { db } from '@/db'
import { newsTable } from '@/repositories'
import newsData from './news.json'

export async function seedNews() {
  const seedValues: (typeof newsTable.$inferInsert)[] = newsData.map(
    (news) => ({
      id: news.id,
      title: news.title,
      content: news.content,
      img: news.img,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }),
  )

  await db.insert(newsTable).values(seedValues)

  return {
    [getTableName(newsTable)]: seedValues.length,
  }
}
