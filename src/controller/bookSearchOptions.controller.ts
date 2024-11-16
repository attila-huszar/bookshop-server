import { Hono } from 'hono'
import { getBookSearchOptions } from '../repository'

export const bookSearchOptions = new Hono()

bookSearchOptions.get('/', async (c) => {
  try {
    const options = await getBookSearchOptions()

    return c.json(options)
  } catch (error) {
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})
