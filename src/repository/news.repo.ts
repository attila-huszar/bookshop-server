import { db } from '../db'
import { news } from './repoHandler'
import type { NewsResponse } from '../types'

export async function getNews(): Promise<NewsResponse[]> {
  try {
    return db.select().from(news)
  } catch (error) {
    throw new Error('DB Error: News not found', { cause: error })
  }
}
