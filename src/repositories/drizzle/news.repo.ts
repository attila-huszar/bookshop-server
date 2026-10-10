import { sqlite } from '@/db'
import { newsTable } from '@/models/sqlite'
import type { News } from '@/types'

export async function getNews(): Promise<News[]> {
  const news = sqlite.select().from(newsTable)
  return news
}
