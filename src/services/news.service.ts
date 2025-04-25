import { newsDB } from '../repositories'

export async function getNews() {
  return newsDB.getNews()
}
