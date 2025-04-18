import { Hono } from 'hono'
import { errorHandler, NotFound } from '../errors'
import type { BookQuery } from '../types'
import * as DB from '../repository'

export const books = new Hono()

books.get('/', async (c) => {
  try {
    const query = c.req.query() as BookQuery | undefined

    if (query?.genre) {
      query.genre = c.req.queries('genre')
    }

    const { booksRecords, booksCount } = await DB.getBooks(query)

    c.header('Access-Control-Expose-Headers', 'x-total-count')
    c.header('x-total-count', booksCount)

    return c.json(booksRecords)
  } catch (error) {
    return errorHandler(c, error)
  }
})

books.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const bookRecord = await DB.getBookById(Number(id))

    if (!bookRecord) {
      throw new NotFound('Book not found')
    }

    return c.json(bookRecord)
  } catch (error) {
    return errorHandler(c, error)
  }
})
