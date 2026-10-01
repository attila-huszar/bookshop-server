import { Hono } from 'hono'
import { getBookById, getBooks } from '@/services'
import { bookQuerySchema, validate } from '@/validation'
import { API } from '@/constants'
import { errorHandler, NotFound } from '@/errors'

export const books = new Hono()

books.get(API.books.root, async (c) => {
  try {
    const rawQuery = c.req.query()
    const query = validate(bookQuerySchema, {
      ...rawQuery,
      ...(rawQuery.genre !== undefined && { genre: c.req.queries('genre') }),
    })

    if (query?.id) {
      const bookRecord = await getBookById(query.id)
      if (!bookRecord) {
        throw new NotFound('Book not found')
      }
      return c.json(bookRecord)
    }

    const { booksRecords, booksCount } = await getBooks(query)

    c.header('Access-Control-Expose-Headers', 'x-total-count')
    c.header('x-total-count', booksCount)

    return c.json(booksRecords)
  } catch (error) {
    return errorHandler(c, error)
  }
})
