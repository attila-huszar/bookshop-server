import { Hono } from 'hono'
import {
  addAuthor,
  addBook,
  addUser,
  getAllAuthors,
  getAllBooks,
  getAllOrders,
  getAllUsers,
  getEmailOutbox,
  hardDeleteAuthors,
  hardDeleteBooks,
  restoreOrders,
  restoreUsers,
  softDeleteOrders,
  softDeleteUsers,
  updateAuthor,
  updateBook,
  updateOrder,
  updateUser,
  uploadProductImage,
} from '@/services'
import { cmsOrderResponse } from '@/utils/response.utils'
import { API } from '@/constants'
import type {
  AuthorInsert,
  AuthorUpdate,
  BookInsert,
  BookUpdate,
  CmsOrderIds,
  CmsOrderUpdate,
  CmsUserIds,
  CmsUserInsert,
  CmsUserUpdate,
} from '@/types'

export const cms = new Hono()

// --- GET --- //
cms.get(API.cms.emailOutbox, async (c) => {
  return c.json(await getEmailOutbox(c.req.query()))
})

cms.get(API.cms.books, async (c) => {
  const booksList = await getAllBooks()

  return c.json(booksList)
})

cms.get(API.cms.authors, async (c) => {
  const authorsList = await getAllAuthors()

  return c.json(authorsList)
})

cms.get(API.cms.orders, async (c) => {
  const ordersList = await getAllOrders()

  return c.json(ordersList.map(cmsOrderResponse))
})

cms.get(API.cms.users, async (c) => {
  const usersList = await getAllUsers()

  return c.json(usersList)
})

// --- POST --- //
cms.post(API.cms.books, async (c) => {
  const book = await c.req.json<BookInsert>()
  const newBook = await addBook(book)

  return c.json(newBook, 201)
})

cms.post(API.cms.authors, async (c) => {
  const author = await c.req.json<AuthorInsert>()
  const newAuthor = await addAuthor(author)

  return c.json(newAuthor, 201)
})

cms.post(API.cms.users, async (c) => {
  const user = await c.req.json<CmsUserInsert>()
  const newUser = await addUser(user)

  return c.json(newUser, 201)
})

// --- PATCH --- //
cms.patch(API.cms.restore.orders, async (c) => {
  const input = await c.req.json<CmsOrderIds>()

  return c.json(await restoreOrders(input))
})

cms.patch(API.cms.restore.users, async (c) => {
  const input = await c.req.json<CmsUserIds>()

  return c.json(await restoreUsers(input))
})

cms.patch(API.cms.books, async (c) => {
  const { id, ...book } = await c.req.json<BookUpdate & { id: number }>()
  const updatedBook = await updateBook(id, book)

  return c.json(updatedBook)
})

cms.patch(API.cms.authors, async (c) => {
  const { id, ...author } = await c.req.json<AuthorUpdate & { id: number }>()
  const updatedAuthor = await updateAuthor(id, author)

  return c.json(updatedAuthor)
})

cms.patch(API.cms.orders, async (c) => {
  const { paymentId, ...fields } = await c.req.json<
    CmsOrderUpdate & { paymentId: string }
  >()
  const updatedOrder = await updateOrder(paymentId, fields)

  return c.json(cmsOrderResponse(updatedOrder))
})

cms.patch(API.cms.users, async (c) => {
  const { uuid, ...fields } = await c.req.json<
    CmsUserUpdate & { uuid: string }
  >()
  const updatedUser = await updateUser(uuid, fields)

  return c.json(updatedUser)
})

// --- DELETE --- //
cms.delete(API.cms.books, async (c) => {
  const { bookIds } = await c.req.json<{ bookIds: number[] }>()
  const deletedIds = await hardDeleteBooks(bookIds)

  return c.json(deletedIds)
})

cms.delete(API.cms.authors, async (c) => {
  const { authorIds } = await c.req.json<{ authorIds: number[] }>()
  const deletedIds = await hardDeleteAuthors(authorIds)

  return c.json(deletedIds)
})

cms.delete(API.cms.users, async (c) => {
  const input = await c.req.json<CmsUserIds>()

  return c.json(await softDeleteUsers(input))
})

cms.delete(API.cms.orders, async (c) => {
  const input = await c.req.json<CmsOrderIds>()

  return c.json(await softDeleteOrders(input))
})

// --- UPLOAD --- //
cms.post(API.cms.productImage, async (c) => {
  const formData = await c.req.formData()
  const image = formData.get('image')

  const result = await uploadProductImage(image)

  return c.json(result)
})
