import { db } from '@/db'
import model from '@/models'
import type { News } from '@/types'

const { newsTable } = model as SQLiteModel

export async function getNews(): Promise<News[]> {
  return db.select().from(newsTable)
}
