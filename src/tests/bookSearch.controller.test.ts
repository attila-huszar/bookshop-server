import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { errorHandler } from '@/errors/errorHandler'
import { mockBooksDB, mockValidate } from './test-setup'

const { books } = await import('@/controller/books.controller')
const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .route('/api', books)

beforeEach(() => {
  mockValidate
    .mockReset()
    .mockImplementation(
      (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
        schema.parse(value),
    )
  mockBooksDB.searchBooks.mockReset().mockResolvedValue([])
})

afterEach(() => {
  mockValidate.mockReset()
})

describe('combined book search', () => {
  it('normalizes the query, bounds results, and maps public book responses', async () => {
    mockBooksDB.searchBooks.mockResolvedValue([
      {
        id: 1,
        title: 'A & B?',
        author: 'An Author',
        authorId: 2,
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
      },
    ])

    const response = await app.request(
      `/api/books/search?${new URLSearchParams({ q: ' A & B? ' })}`,
    )
    const results = (await response.json()) as unknown[]

    expect(response.status).toBe(200)
    expect(mockBooksDB.searchBooks).toHaveBeenCalledWith('A & B?', 10)
    expect(results).toMatchObject([
      { id: 1, author: 'An Author', discountPrice: 9 },
    ])
    expect(results[0]).not.toHaveProperty('authorId')
    expect(results[0]).not.toHaveProperty('_id')
  })

  it.each([undefined, '', ' ', 'a', 'a'.repeat(101)])(
    'rejects invalid query %s',
    async (q) => {
      const query = q === undefined ? '' : `?${new URLSearchParams({ q })}`
      const response = await app.request(`/api/books/search${query}`)

      expect(response.status).toBe(400)
      expect(mockBooksDB.searchBooks).not.toHaveBeenCalled()
    },
  )

  it('reports database failures instead of returning partial or empty results', async () => {
    mockBooksDB.searchBooks.mockRejectedValue(new Error('Database unavailable'))
    const response = await app.request('/api/books/search?q=Author')

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: 'INTERNAL_ERROR' })
  })
})
