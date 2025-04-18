import { Hono } from 'hono'
import { errorHandler } from '../errors'
import * as DB from '../repository'

export const news = new Hono()

news.get('/', async (c) => {
  try {
    const newsRecords = await DB.getNews()

    return c.json(newsRecords)
  } catch (error) {
    return errorHandler(c, error)
  }
})
