import { Hono } from 'hono'
import {
  addBook,
  deleteBooks,
  getAllAuthors,
  getAllBooks,
  getAllOrders,
  getAllUsers,
} from '../services'
import { errorHandler } from '../errors'
import type { BookCreate } from '../types'

export const cms = new Hono()

cms.get('/orders/all', async (c) => {
  try {
    const ordersList = await getAllOrders()
    return c.json(ordersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/users/all', async (c) => {
  try {
    const usersList = await getAllUsers()
    return c.json(usersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/books/all', async (c) => {
  try {
    const booksList = await getAllBooks()
    return c.json(booksList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/authors/all', async (c) => {
  try {
    const authorsList = await getAllAuthors()
    return c.json(authorsList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.post('/books/add', async (c) => {
  try {
    const book = await c.req.json<BookCreate>()
    const newBook = await addBook(book)
    return c.json(newBook, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete('/books/delete', async (c) => {
  try {
    const { bookIds } = await c.req.json<{ bookIds: number[] }>()
    if (!Array.isArray(bookIds) || bookIds.length === 0) {
      return c.json({ error: 'Invalid book IDs' }, 400)
    }
    const deletedBooks = await deleteBooks(bookIds)
    const deletedIds = deletedBooks.map((book) => book.id)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})
