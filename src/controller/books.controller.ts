import { Hono } from 'hono'
import { getBookById, getBooks } from '@/services'
import { errorHandler, NotFound } from '@/errors'
import type { BookQuery } from '@/types'

export const books = new Hono()

books.get('/', async (c) => {
  try {
    const query = c.req.query() as BookQuery | undefined

    if (query?.id) {
      const bookRecord = await getBookById(Number(query.id))
      if (!bookRecord) {
        throw new NotFound('Book not found')
      }
      return c.json(bookRecord)
    }

    if (query?.genre) {
      query.genre = c.req.queries('genre')
    }

    const { booksRecords, booksCount } = await getBooks(query)

    c.header('Access-Control-Expose-Headers', 'x-total-count')
    c.header('x-total-count', booksCount)

    return c.json(booksRecords)
  } catch (error) {
    return errorHandler(c, error)
  }
})
