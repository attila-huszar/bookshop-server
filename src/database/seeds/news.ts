import { getTableName } from 'drizzle-orm'
import { db } from '@/db'
import { newsTable } from '@/models/sqlite'
import newsData from './news.json'
import type { NewsInsert } from '@/types'

export async function seedNews() {
  const seedValues: NewsInsert[] = newsData.map((news) => ({
    id: news.id,
    title: news.title,
    content: news.content,
    img: news.img,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  await db.insert(newsTable).values(seedValues)

  return {
    [getTableName(newsTable)]: seedValues.length,
  }
}
