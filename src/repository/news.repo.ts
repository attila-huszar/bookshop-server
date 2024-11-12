import { db } from '../db'
import { news } from './repoHandler'

export async function getNews() {
  return db.select().from(news)
}
