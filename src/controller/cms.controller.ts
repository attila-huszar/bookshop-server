import { Hono } from 'hono'
import {
  addAuthor,
  addBook,
  addOrder,
  addUser,
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
  updateOrder,
  updateUser,
  uploadProductImage,
} from '@/services'
import { API } from '@/constants'
import { errorHandler } from '@/errors'
import type {
  AuthorInsert,
  AuthorUpdate,
  BookInsert,
  BookUpdate,
  OrderInsert,
  OrderUpdate,
  UserInsert,
  UserUpdate,
} from '@/types'

export const cms = new Hono()

// --- GET --- //
cms.get(API.cms.books, async (c) => {
  try {
    const booksList = await getAllBooks()
    return c.json(booksList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get(API.cms.authors, async (c) => {
  try {
    const authorsList = await getAllAuthors()
    return c.json(authorsList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get(API.cms.orders, async (c) => {
  try {
    const ordersList = await getAllOrders()
    return c.json(ordersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.get(API.cms.users, async (c) => {
  try {
    const usersList = await getAllUsers()
    return c.json(usersList)
  } catch (error) {
    return errorHandler(c, error)
  }
})

// --- POST --- //
cms.post(API.cms.books, async (c) => {
  try {
    const book = await c.req.json<BookInsert>()
    const newBook = await addBook(book)
    return c.json(newBook, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.post(API.cms.authors, async (c) => {
  try {
    const author = await c.req.json<AuthorInsert>()
    const newAuthor = await addAuthor(author)
    return c.json(newAuthor, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.post(API.cms.orders, async (c) => {
  try {
    const order = await c.req.json<OrderInsert>()
    const newOrder = await addOrder(order)
    return c.json(newOrder, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.post(API.cms.users, async (c) => {
  try {
    const user = await c.req.json<UserInsert>()
    const newUser = await addUser(user)
    return c.json(newUser, 201)
  } catch (error) {
    return errorHandler(c, error)
  }
})

// --- PATCH --- //
cms.patch(API.cms.books, async (c) => {
  try {
    const { id, ...book } = await c.req.json<BookUpdate & { id: number }>()
    const updatedBook = await updateBook(id, book)
    return c.json(updatedBook)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.patch(API.cms.authors, async (c) => {
  try {
    const { id, ...author } = await c.req.json<AuthorUpdate & { id: number }>()
    const updatedAuthor = await updateAuthor(id, author)
    return c.json(updatedAuthor)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.patch(API.cms.orders, async (c) => {
  try {
    const { paymentId, ...fields } = await c.req.json<
      OrderUpdate & { paymentId: string }
    >()
    const updatedOrder = await updateOrder(paymentId, fields)
    return c.json(updatedOrder)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.patch(API.cms.users, async (c) => {
  try {
    const { uuid, ...fields } = await c.req.json<
      UserUpdate & { uuid: string }
    >()
    const updatedUser = await updateUser(uuid, fields)
    return c.json(updatedUser)
  } catch (error) {
    return errorHandler(c, error)
  }
})

// --- DELETE --- //
cms.delete(API.cms.books, async (c) => {
  try {
    const { bookIds } = await c.req.json<{ bookIds: number[] }>()
    const deletedIds = await deleteBooks(bookIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete(API.cms.authors, async (c) => {
  try {
    const { authorIds } = await c.req.json<{ authorIds: number[] }>()
    const deletedIds = await deleteAuthors(authorIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete(API.cms.orders, async (c) => {
  try {
    const { orderIds } = await c.req.json<{ orderIds: number[] }>()
    const deletedIds = await deleteOrders(orderIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})

cms.delete(API.cms.users, async (c) => {
  try {
    const { userIds } = await c.req.json<{ userIds: number[] }>()
    const deletedIds = await deleteUsers(userIds)
    return c.json(deletedIds)
  } catch (error) {
    return errorHandler(c, error)
  }
})

// --- UPLOAD --- //
cms.post(API.cms.productImage, async (c) => {
  try {
    const formData = await c.req.formData()
    const image = formData.get('image')

    const result = await uploadProductImage(image)

    return c.json(result)
  } catch (error) {
    return errorHandler(c, error)
  }
})
