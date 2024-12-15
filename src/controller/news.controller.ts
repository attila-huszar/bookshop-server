import { Hono } from 'hono'
import * as DB from '../repository'
import * as Errors from '../errors'

export const news = new Hono()

news.get('/', async (c) => {
  try {
    const newsRecords = await DB.getNews()

    return c.json(newsRecords)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
