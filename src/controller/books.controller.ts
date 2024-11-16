import { Hono } from 'hono'
import { getBooks, getBookById } from '../repository'
import type { BookQuery } from '../types'

export const books = new Hono()

books.get('/', async (c) => {
  try {
    const query = c.req.query() as BookQuery | undefined

    if (query?.genre) {
      query.genre = c.req.queries('genre')
    }

    const { booksRecords, booksCount } = await getBooks(query)

    c.header('Access-Control-Expose-Headers', 'x-total-count')
    c.header('x-total-count', booksCount)

    return c.json(booksRecords)
  } catch (error) {
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})

books.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const bookRecord = await getBookById(Number(id))

    if (!bookRecord) {
      return c.json({ error: 'Book not found' }, 404)
    }

    return c.json(bookRecord)
  } catch (error) {
    console.error(error)

    return c.json({ error: 'Internal server error' }, 500)
  }
})
