import { Hono } from 'hono'
import { getBookById, getBooks, searchBooks } from '@/services/books.service'
import { bookQuerySchema, bookSearchSchema, validate } from '@/validation'
import { API } from '@/constants/paths'
import { NotFound } from '@/errors'

export const books = new Hono()

books.get(API.books.root, async (c) => {
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
  c.header('x-total-count', String(booksCount))

  return c.json(booksRecords)
})

books.get(API.books.search, async (c) => {
  const query = validate(bookSearchSchema, c.req.query())

  return c.json(await searchBooks(query.q))
})
