import { Hono } from 'hono'
import {
  addAuthor,
  addBook,
  deleteAuthors,
  deleteBooks,
  getAllAuthors,
  getAllBooks,
  getAllOrders,
  getAllUsers,
} from '@/services'
import { errorHandler } from '@/errors'
import type { AuthorCreate, BookCreate } from '@/types'

export const cms = new Hono()

cms.get('/orders/list', async (c) => {
  try {
    const ordersList = await getAllOrders()
    return c.json(ordersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/users/list', async (c) => {
  try {
    const usersList = await getAllUsers()
    return c.json(usersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/books/list', async (c) => {
  try {
    const booksList = await getAllBooks()
    return c.json(booksList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/authors/list', async (c) => {
  try {
    const authorsList = await getAllAuthors()
    return c.json(authorsList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.post('/books/create', async (c) => {
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
    const deletedIds = await deleteBooks(bookIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.post('/authors/create', async (c) => {
  try {
    const author = await c.req.json<AuthorCreate>()
    const newAuthor = await addAuthor(author)
    return c.json(newAuthor, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete('/authors/delete', async (c) => {
  try {
    const { authorIds } = await c.req.json<{ authorIds: number[] }>()
    if (!Array.isArray(authorIds) || authorIds.length === 0) {
      return c.json({ error: 'Invalid author IDs' }, 400)
    }
    const deletedIds = await deleteAuthors(authorIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})
