import { newsDB } from '@/repositories'
import { newsResponse } from '@/utils/response.utils'

export async function getNews(): Promise<ReturnType<typeof newsResponse>[]> {
  const news = await newsDB.getNews()

  return news.map(newsResponse)
}
