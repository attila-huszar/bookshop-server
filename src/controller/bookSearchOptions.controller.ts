import { Hono } from 'hono'
import { getBookSearchOptions } from '../repository'
import * as Errors from '../errors'

export const bookSearchOptions = new Hono()

bookSearchOptions.get('/', async (c) => {
  try {
    const options = await getBookSearchOptions()

    return c.json(options)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
