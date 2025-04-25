import { Hono } from 'hono'
import { getBookSearchOptions } from '../services'
import { errorHandler } from '../errors'

export const bookSearchOptions = new Hono()

bookSearchOptions.get('/', async (c) => {
  try {
    const options = await getBookSearchOptions()

    return c.json(options)
  } catch (error) {
    return errorHandler(c, error)
  }
})
