import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { booksTable } from '../db/schema'
import { buildBookQueryConditions } from '../utils/buildBookQueryConditions'
import type { BookQuery } from '../types/query'

export const books = new Hono().basePath('/books')

books.get('/', async (c) => {
  const query = c.req.query() as BookQuery | undefined

  const page = Math.min(Math.max(1, Number(query?.page) || 1), 100)
  const limit = Math.min(Math.max(1, Number(query?.limit) || 8), 32)
  const offset = (page - 1) * limit

  if (query?.genre) {
    const genres = c.req.queries('genre')
    query.genre = genres
  }

  const booksCount = await db.$count(booksTable)
  const conditions = query ? buildBookQueryConditions(query) : undefined

  const books = await db
    .select()
    .from(booksTable)
    .where(conditions)
    .limit(limit)
    .offset(offset)

  c.header('x-total-count', booksCount.toString())
  return c.json(books)
})

books.get('/:id', async (c) => {
  const id = c.req.param('id')

  const bookRecord = (
    await db.select().from(booksTable).where(eq(booksTable.id, +id))
  )[0]

  if (!bookRecord) {
    return c.json({ error: 'Book not found' }, 404)
  }

  return c.json(bookRecord)
})
