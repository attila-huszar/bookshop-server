import { Hono } from 'hono'
import { getBookSearchOptions } from '@/services'
import { API } from '@/constants'

export const bookSearchOptions = new Hono()

bookSearchOptions.get(API.searchOptions.root, async (c) => {
  const options = await getBookSearchOptions()

  return c.json(options)
})
