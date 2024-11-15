import { news } from './repoHandler'
import { db } from '../db'
import { DBError } from '../errors'
import type { NewsResponse } from '../types'

export async function getNews(): Promise<NewsResponse[]> {
  try {
    return db.select().from(news)
  } catch (error) {
    throw new DBError(`getNews: ${error instanceof Error && error.message}`)
  }
}
