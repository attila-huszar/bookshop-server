import { Hono } from 'hono'
import { getBookSearchOptions } from '../repository'

export const bookSearchOptions = new Hono().basePath('/search_opts')

bookSearchOptions.get('/', async (c) => {
  const options = await getBookSearchOptions()

  return c.json(options)
})
