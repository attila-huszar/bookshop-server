import { Hono } from 'hono'
import * as DB from '../repository'
import * as Errors from '../errors'
import type { BookQuery } from '../types'

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
    return Errors.Handler(c, error)
  }
})

books.get('/:id', async (c) => {
  try {
    const id = c.req.param('id')

    const bookRecord = await DB.getBookById(Number(id))

    if (!bookRecord) {
      throw new Errors.NotFound('Book not found')
    }

    return c.json(bookRecord)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
