import { newsTable } from './repoHandler'
import { db } from '../db'
import type { News } from '../types'

export async function getNews(): Promise<News[]> {
  return db.select().from(newsTable)
}
