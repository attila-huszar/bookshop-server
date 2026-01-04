import { authorsDB, booksDB, ordersDB, usersDB } from '@/repositories'
import {
  authorInsertSchema,
  authorUpdateSchema,
  bookInsertSchema,
  bookUpdateSchema,
  imageSchema,
  idsSchema,
  idSchema,
  validate,
} from '@/validation'
import { Folder, uploadFile } from '@/utils'
import type {
  AuthorInsert,
  AuthorUpdate,
  BookInsert,
  BookUpdate,
} from '@/types'

export async function getAllOrders() {
  const orders = await ordersDB.getAllOrders()

  return orders
}

export async function getAllUsers() {
  const users = await usersDB.getAllUsers()

  return users.map((user) => {
    const { password, ...userWithoutCreds } = user

    return userWithoutCreds
  })
}

export async function getAllBooks() {
  const books = await booksDB.getAllBooks()

  return books
}

export async function getAllAuthors() {
  const authors = await authorsDB.getAllAuthors()

  return authors
}

export async function addBook(book: BookInsert) {
  const validatedBook = validate(bookInsertSchema, book)
  const newBook = await booksDB.insertBook(validatedBook)

  return newBook
}

export async function updateBook(bookId: number, book: BookUpdate) {
  const validatedId = validate(idSchema, bookId)
  const validatedBook = validate(bookUpdateSchema, book)
  const updatedBook = await booksDB.updateBook(validatedId, validatedBook)

  return updatedBook
}

export async function deleteBooks(bookIds: number[]) {
  const validatedIds = validate(idsSchema, bookIds)
  const deletedIds = await booksDB.deleteBooks(validatedIds)

  return deletedIds
}

export async function addAuthor(author: AuthorInsert) {
  const validatedAuthor = validate(authorInsertSchema, author)
  const newAuthor = await authorsDB.insertAuthor(validatedAuthor)

  return newAuthor
}

export async function updateAuthor(authorId: number, author: AuthorUpdate) {
  const validatedId = validate(idSchema, authorId)
  const validatedAuthor = validate(authorUpdateSchema, author)
  const updatedAuthor = await authorsDB.updateAuthor(
    validatedId,
    validatedAuthor,
  )

  return updatedAuthor
}

export async function deleteAuthors(authorIds: number[]) {
  const validatedIds = validate(idsSchema, authorIds)
  const deletedIds = await authorsDB.deleteAuthors(validatedIds)

  return deletedIds
}

export async function deleteUsers(userIds: number[]) {
  const validatedIds = validate(idsSchema, userIds)
  const deletedIds = await usersDB.deleteUsersByIds(validatedIds)

  return deletedIds
}

export async function deleteOrders(orderIds: number[]) {
  const validatedIds = validate(idsSchema, orderIds)
  const deletedIds = await ordersDB.deleteOrdersByIds(validatedIds)

  return deletedIds
}

export async function uploadProductImage(image: Bun.FormDataEntryValue | null) {
  if (!(image instanceof File)) {
    throw new Error('Image must be a file')
  }

  validate(imageSchema, image)

  const url = await uploadFile(image, Folder.ProductImages)

  return { url }
}
