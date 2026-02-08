import { newsDB } from '@/repositories'
import { stripTimestamps } from '@/utils'
import type { News } from '@/types'

export async function getNews(): Promise<WithoutTS<News>[]> {
  const news = await newsDB.getNews()
  return news.map(stripTimestamps)
}
