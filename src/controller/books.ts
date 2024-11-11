import { Hono } from 'hono'
import { getBookById, getBooks } from '../repository/bookRepo'
import type { BookQuery } from '../types'

export const books = new Hono().basePath('/books')

books.get('/', async (c) => {
  const query = c.req.query() as BookQuery | undefined

  if (query?.genre) {
    query.genre = c.req.queries('genre')
  }

  const { books, booksCount } = await getBooks(query)

  c.header('x-total-count', booksCount)
  return c.json(books)
})

books.get('/:id', async (c) => {
  const id = c.req.param('id')

  const bookRecord = await getBookById(Number(id))

  if (!bookRecord) {
    return c.json({ error: 'Book not found' }, 404)
  }

  return c.json(bookRecord)
})
