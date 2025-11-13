import { authorsDB, booksDB, ordersDB, usersDB } from '@/repositories'
import {
  authorCreateSchema,
  bookCreateSchema,
  bookUpdateSchema,
  imageSchema,
  validate,
} from '@/validation'
import { Folder, uploadFile } from '@/utils'
import type { AuthorCreate, BookCreate, BookUpdate } from '@/types'

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

export async function addBook(book: BookCreate) {
  const validatedBook = validate(bookCreateSchema, book)
  const newBook = await booksDB.insertBook(validatedBook)

  return newBook
}

export async function updateBook(bookId: number, book: BookUpdate) {
  const validatedBook = validate(bookUpdateSchema, book)
  const updatedBook = await booksDB.updateBook(bookId, validatedBook)

  return updatedBook
}

export async function deleteBooks(bookIds: number[]) {
  const deletedIds = await booksDB.deleteBooks(bookIds)

  return deletedIds
}

export async function addAuthor(author: AuthorCreate) {
  const validatedAuthor = validate(authorCreateSchema, author)
  const newAuthor = await authorsDB.insertAuthor(validatedAuthor)

  return newAuthor
}

export async function deleteAuthors(authorIds: number[]) {
  const deletedIds = await authorsDB.deleteAuthors(authorIds)

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
