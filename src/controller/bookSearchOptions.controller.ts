import { Hono } from 'hono'
import { getBookSearchOptions } from '@/services'
import { API } from '@/constants'
import { errorHandler } from '@/errors'

export const bookSearchOptions = new Hono()

bookSearchOptions.get(API.searchOptions.root, async (c) => {
  try {
    const options = await getBookSearchOptions()

    return c.json(options)
  } catch (error) {
    return errorHandler(c, error)
  }
})
