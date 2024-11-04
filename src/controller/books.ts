import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { booksTable } from '../db/schema'

export const books = new Hono().basePath('/books')

books.get('/', async (c) => {
  const books = await db.select().from(booksTable)

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
