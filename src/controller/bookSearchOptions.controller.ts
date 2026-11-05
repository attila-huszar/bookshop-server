import { Hono } from 'hono'
import { getBookSearchOptions } from '@/services/bookSearchOptions.service'
import { API } from '@/constants/paths'

export const bookSearchOptions = new Hono()

bookSearchOptions.get(API.searchOptions.root, async (c) => {
  const options = await getBookSearchOptions()

  return c.json(options)
})
