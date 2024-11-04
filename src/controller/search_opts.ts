import { Hono } from 'hono'
import { max, min } from 'drizzle-orm'
import { db } from '../db'
import { booksTable } from '../db/schema'

export const searchOptions = new Hono().basePath('/search_opts')

searchOptions.get('/', async (c) => {
  const minMaxFields = await db
    .select({
      minPrice: min(booksTable.discountPrice),
      maxPrice: max(booksTable.discountPrice),
      minYear: min(booksTable.publishYear),
      maxYear: max(booksTable.publishYear),
    })
    .from(booksTable)

  const genresResult = await db
    .selectDistinct({ genre: booksTable.genre })
    .from(booksTable)

  const genres = genresResult.map((row) => row.genre)

  return c.json({
    ...minMaxFields[0],
    genres,
  })
})
