import { Hono } from 'hono'
import { getNews } from '@/services'
import { API } from '@/constants/paths'

export const news = new Hono()

news.get(API.news.root, async (c) => {
  const newsRecords = await getNews()

  return c.json(newsRecords)
})
