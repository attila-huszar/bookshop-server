import { authorsDB, booksDB, ordersDB, usersDB } from '@/repositories'
import {
  authorInsertSchema,
  authorUpdateSchema,
  bookInsertSchema,
  bookUpdateSchema,
  idSchema,
  idsSchema,
  imageSchema,
  orderInsertSchema,
  orderUpdateSchema,
  paymentIdSchema,
  userInsertSchema,
  userUpdateSchema,
  validate,
} from '@/validation'
import { Folder, uploadFile } from '@/utils'
import type {
  Author,
  AuthorInsert,
  AuthorUpdate,
  Book,
  BookInsert,
  BookUpdate,
  Order,
  OrderInsert,
  OrderUpdate,
  User,
  UserInsert,
  UserUpdate,
} from '@/types'

// --- READ --- //
export async function getAllBooks(): Promise<Book[]> {
  const books = await booksDB.getAllBooks()
  return books
}

export async function getAllAuthors(): Promise<Author[]> {
  const authors = await authorsDB.getAllAuthors()
  return authors
}

export async function getAllOrders(): Promise<Order[]> {
  const orders = await ordersDB.getAllOrders()
  return orders
}

export async function getAllUsers(): Promise<Omit<User, 'password'>[]> {
  const users = await usersDB.getAllUsers()
  return users.map(({ password, ...user }) => user)
}

// --- CREATE --- //
export async function addBook(book: BookInsert): Promise<Book> {
  const validatedBook = validate(bookInsertSchema, book)
  const newBook = await booksDB.insertBook(validatedBook)
  return newBook
}

export async function addAuthor(author: AuthorInsert): Promise<Author> {
  const validatedAuthor = validate(authorInsertSchema, author)
  const newAuthor = await authorsDB.insertAuthor(validatedAuthor)
  return newAuthor
}

export async function addOrder(order: OrderInsert): Promise<Order> {
  const validatedOrder = validate(orderInsertSchema, order)
  const newOrder = await ordersDB.insertOrder(validatedOrder)

  if (!newOrder) {
    throw new Error('Failed to create order')
  }
  return newOrder
}

export async function addUser(
  user: UserInsert,
): Promise<Omit<User, 'password'>> {
  const validatedUser = validate(userInsertSchema, user)
  const newUser = await usersDB.createUser(validatedUser)

  if (!newUser) {
    throw new Error('Failed to create user')
  }
  const { password, ...userWithoutPassword } = newUser
  return userWithoutPassword
}

// --- UPDATE --- //
export async function updateBook(
  bookId: number,
  book: BookUpdate,
): Promise<Book> {
  const validatedId = validate(idSchema, bookId)
  const validatedBook = validate(bookUpdateSchema, book)
  const updatedBook = await booksDB.updateBook(validatedId, validatedBook)

  if (!updatedBook) {
    throw new Error(`Book with id ${bookId} not found`)
  }
  return updatedBook
}

export async function updateAuthor(
  authorId: number,
  author: AuthorUpdate,
): Promise<Author> {
  const validatedId = validate(idSchema, authorId)
  const validatedAuthor = validate(authorUpdateSchema, author)
  const updatedAuthor = await authorsDB.updateAuthor(
    validatedId,
    validatedAuthor,
  )

  if (!updatedAuthor) {
    throw new Error(`Author with id ${authorId} not found`)
  }
  return updatedAuthor
}

export async function updateOrder(
  paymentId: string,
  fields: OrderUpdate,
): Promise<Order> {
  const validatedId = validate(paymentIdSchema, paymentId)
  const validatedFields = validate(orderUpdateSchema, fields)
  const updatedOrder = await ordersDB.updateOrder(validatedId, validatedFields)

  if (!updatedOrder) {
    throw new Error(`Order with paymentId ${paymentId} not found`)
  }
  return updatedOrder
}

export async function updateUser(
  userId: number,
  user: UserUpdate,
): Promise<Omit<User, 'password'>> {
  const validatedId = validate(idSchema, userId)
  const validatedUser = validate(userUpdateSchema, user)
  const updatedUser = await usersDB.updateUserBy(
    'id',
    validatedId,
    validatedUser,
  )

  if (!updatedUser) {
    throw new Error(`User with id ${userId} not found`)
  }
  const { password, ...userWithoutPassword } = updatedUser
  return userWithoutPassword
}

// --- DELETE --- //
export async function deleteBooks(bookIds: number[]): Promise<number[]> {
  const validatedIds = validate(idsSchema, bookIds)
  const deletedIds = await booksDB.deleteBooks(validatedIds)
  return deletedIds
}

export async function deleteAuthors(authorIds: number[]): Promise<number[]> {
  const validatedIds = validate(idsSchema, authorIds)
  const deletedIds = await authorsDB.deleteAuthors(validatedIds)
  return deletedIds
}

export async function deleteOrders(orderIds: number[]): Promise<number[]> {
  const validatedIds = validate(idsSchema, orderIds)
  const deletedIds = await ordersDB.deleteOrdersByIds(validatedIds)
  return deletedIds
}

export async function deleteUsers(userIds: number[]): Promise<number[]> {
  const validatedIds = validate(idsSchema, userIds)
  const deletedIds = await usersDB.deleteUsersByIds(validatedIds)
  return deletedIds
}

// --- UPLOADS --- //
export async function uploadProductImage(
  image: Bun.FormDataEntryValue | null,
): Promise<{ url: string }> {
  if (!(image instanceof File)) {
    throw new Error('Image must be a file')
  }
  validate(imageSchema, image)

  const url = await uploadFile(image, Folder.ProductImages)
  return { url }
}
