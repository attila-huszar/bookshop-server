import { beforeEach, describe, expect, it } from 'bun:test'
import type { Book, BookInsert, BookUpdate } from '@/types'
import { mockBooksDB, mockRepositories, mockValidate } from './test-setup'

await mockRepositories()
const { addBook, updateBook } = await import('@/services/cms.service')

const book: Book = {
  id: 1,
  title: 'Example book',
  authorId: 1,
  genre: 'Fiction',
  imgUrl: 'https://bookshop.test/cover.webp',
  description: 'An example description',
  publishYear: 2026,
  rating: 5,
  price: 9.99,
  discount: 20,
  discountPrice: 7.992,
  topSellers: false,
  newRelease: false,
  createdAt: new Date(),
  updatedAt: new Date(),
}

beforeEach(() => {
  mockValidate
    .mockReset()
    .mockImplementation(
      (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
        schema.parse(value),
    )
  mockBooksDB.getBookById.mockReset().mockResolvedValue(book)
  mockBooksDB.insertBook
    .mockReset()
    .mockImplementation((fields: BookInsert) =>
      Promise.resolve({ ...book, ...fields }),
    )
  mockBooksDB.updateBook
    .mockReset()
    .mockImplementation((id: number, fields: BookUpdate) =>
      Promise.resolve({ ...book, ...fields, id }),
    )
})

describe('CMS pricing', () => {
  it('derives the stored discount price instead of accepting a submitted value', async () => {
    const { id, createdAt, updatedAt, ...fields } = book
    const result = await addBook({ ...fields, discountPrice: 0 })

    expect(mockBooksDB.insertBook).toHaveBeenCalledWith(
      expect.objectContaining({
        price: 9.99,
        discount: 20,
        discountPrice: 7.99,
      }),
    )
    expect(result.discountPrice).toBe(7.99)
  })

  it.each([
    { fields: { price: 10 }, price: 10, discount: 20, discountPrice: 8 },
    { fields: { discount: 50 }, price: 9.99, discount: 50, discountPrice: 5 },
    {
      fields: { discountPrice: 0 },
      price: 9.99,
      discount: 20,
      discountPrice: 7.99,
    },
    {
      fields: { price: 1.005, discount: 0 },
      price: 1.01,
      discount: 0,
      discountPrice: 1.01,
    },
  ])(
    'recalculates a partial price update: $fields',
    async ({ fields, price, discount, discountPrice }) => {
      const result = await updateBook(book.id, fields)

      expect(mockBooksDB.updateBook).toHaveBeenCalledWith(
        book.id,
        expect.objectContaining({ discountPrice }),
      )
      expect(result).toMatchObject({ price, discount, discountPrice })
    },
  )
})
