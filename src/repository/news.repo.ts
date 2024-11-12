import { db } from '../db'
import { news } from './repoHandler'
import type { NewsResponse } from '../types'

export async function getNews(): Promise<NewsResponse[]> {
  return db.select().from(news)
}
