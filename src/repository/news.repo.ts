import { news } from './repoHandler'
import { db } from '../db'
import type { NewsResponse } from '../types'

export async function getNews(): Promise<NewsResponse[]> {
  return db.select().from(news)
}
