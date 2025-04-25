import { Hono } from 'hono'
import { getNews } from '../services'
import { errorHandler } from '../errors'

export const news = new Hono()

news.get('/', async (c) => {
  try {
    const newsRecords = await getNews()

    return c.json(newsRecords)
  } catch (error) {
    return errorHandler(c, error)
  }
})
