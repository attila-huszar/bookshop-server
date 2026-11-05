import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { errorHandler } from '@/errors/errorHandler'
import { mockBooksDB, mockValidate } from './test-setup'

const { books } = await import('@/controller/books.controller')
const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .route('/api', books)
const book = {
  id: 7,
  title: 'Recommended book',
  author: 'An Author',
  authorId: 1,
  _id: 'internal-mongo-id',
  genre: 'Fiction',
  imgUrl: 'book.jpg',
  description: 'A book',
  publishYear: 2020,
  rating: 4,
  price: 10,
  discount: 10,
  discountPrice: 999,
  topSellers: false,
  newRelease: false,
}

beforeEach(() => {
  mockValidate
    .mockReset()
    .mockImplementation(
      (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
        schema.parse(value),
    )
  mockBooksDB.getBooks
    .mockReset()
    .mockResolvedValue({ booksRecords: [book], booksCount: 12 })
  mockBooksDB.getRecommendedBooks.mockReset().mockResolvedValue([book])
})

afterEach(() => {
  mockValidate.mockReset()
})

describe('books collection recommendations', () => {
  it('returns the random selection as public books with its actual count', async () => {
    const response = await app.request('/api/books?recommended=true')
    const results = (await response.json()) as unknown[]

    expect(response.status).toBe(200)
    expect(mockBooksDB.getRecommendedBooks).toHaveBeenCalledTimes(1)
    expect(mockBooksDB.getBooks).not.toHaveBeenCalled()
    expect(response.headers.get('x-total-count')).toBe('1')
    expect(results).toMatchObject([
      { id: 7, author: 'An Author', discountPrice: 9 },
    ])
    expect(results[0]).not.toHaveProperty('authorId')
    expect(results[0]).not.toHaveProperty('_id')
  })

  it('uses ordinary catalogue filtering when recommended is false', async () => {
    const response = await app.request(
      '/api/books?recommended=false&topSellers=true',
    )

    expect(response.status).toBe(200)
    expect(mockBooksDB.getBooks).toHaveBeenCalledWith({
      recommended: false,
      topSellers: true,
    })
    expect(mockBooksDB.getRecommendedBooks).not.toHaveBeenCalled()
    expect(response.headers.get('x-total-count')).toBe('12')
  })

  it('rejects invalid recommendation flags before querying the database', async () => {
    const response = await app.request('/api/books?recommended=anything')

    expect(response.status).toBe(400)
    expect(mockBooksDB.getRecommendedBooks).not.toHaveBeenCalled()
    expect(mockBooksDB.getBooks).not.toHaveBeenCalled()
  })

  it('returns an empty selection when the catalogue has no recommendations', async () => {
    mockBooksDB.getRecommendedBooks.mockResolvedValue([])
    const response = await app.request('/api/books?recommended=true')

    expect(response.status).toBe(200)
    expect(response.headers.get('x-total-count')).toBe('0')
    expect(await response.json()).toEqual([])
  })

  it('propagates recommendation failures to the HTTP error handler', async () => {
    mockBooksDB.getRecommendedBooks.mockRejectedValue(
      new Error('Database unavailable'),
    )
    const response = await app.request('/api/books?recommended=true')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' })
  })
})
