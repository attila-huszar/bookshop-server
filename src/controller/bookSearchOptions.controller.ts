import { Hono } from 'hono'
import { errorHandler } from '../errors'
import * as DB from '../repository'

export const bookSearchOptions = new Hono()

bookSearchOptions.get('/', async (c) => {
  try {
    const options = await DB.getBookSearchOptions()

    return c.json(options)
  } catch (error) {
    return errorHandler(c, error)
  }
})
