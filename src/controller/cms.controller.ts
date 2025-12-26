import { Hono } from 'hono'
import {
  addAuthor,
  addBook,
  deleteAuthors,
  deleteBooks,
  deleteOrders,
  deleteUsers,
  getAllAuthors,
  getAllBooks,
  getAllOrders,
  getAllUsers,
  updateAuthor,
  updateBook,
  uploadProductImage,
} from '@/services'
import { errorHandler } from '@/errors'
import type {
  AuthorCreate,
  AuthorUpdate,
  BookCreate,
  BookUpdate,
} from '@/types'

export const cms = new Hono()

cms.get('/orders', async (c) => {
  try {
    const ordersList = await getAllOrders()
    return c.json(ordersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete('/orders', async (c) => {
  try {
    const { orderIds } = await c.req.json<{ orderIds: number[] }>()
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      return c.json({ error: 'Invalid order IDs' }, 400)
    }

    const deletedIds = await deleteOrders(orderIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/users', async (c) => {
  try {
    const usersList = await getAllUsers()
    return c.json(usersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete('/users', async (c) => {
  try {
    const { userIds } = await c.req.json<{ userIds: number[] }>()
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return c.json({ error: 'Invalid user IDs' }, 400)
    }

    const deletedIds = await deleteUsers(userIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/books', async (c) => {
  try {
    const booksList = await getAllBooks()
    return c.json(booksList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get('/authors', async (c) => {
  try {
    const authorsList = await getAllAuthors()
    return c.json(authorsList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.post('/books', async (c) => {
  try {
    const book = await c.req.json<BookCreate>()
    const newBook = await addBook(book)
    return c.json(newBook, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.patch('/books', async (c) => {
  try {
    const { id, ...book } = await c.req.json<BookUpdate & { id: number }>()
    const updatedBook = await updateBook(id, book)
    return c.json(updatedBook)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete('/books', async (c) => {
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

cms.post('/authors', async (c) => {
  try {
    const author = await c.req.json<AuthorCreate>()
    const newAuthor = await addAuthor(author)
    return c.json(newAuthor, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.patch('/authors', async (c) => {
  try {
    const { id, ...author } = await c.req.json<AuthorUpdate & { id: number }>()
    const updatedAuthor = await updateAuthor(id, author)
    return c.json(updatedAuthor)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete('/authors', async (c) => {
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

cms.post('/product-image', async (c) => {
  try {
    const formData = await c.req.formData()
    const image = formData.get('image')

    const result = await uploadProductImage(image)

    return c.json(result)
  } catch (error) {
    return errorHandler(c, error)
  }
})
