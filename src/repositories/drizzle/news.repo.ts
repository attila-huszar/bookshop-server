import { sqlite } from '@/db'
import model from '@/models'
import type { News } from '@/types'

const { newsTable } = model as SQLiteModel

export async function getNews(): Promise<News[]> {
  const news = sqlite.select().from(newsTable)
  return news
}
