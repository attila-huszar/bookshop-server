import { authorsDB, booksDB, ordersDB, usersDB } from '@/repositories'
import {
  authorInsertSchema,
  authorUpdateSchema,
  bookInsertSchema,
  bookUpdateSchema,
  cmsOrderIdsSchema,
  cmsOrderUpdateSchema,
  cmsUserIdsSchema,
  cmsUserInsertSchema,
  cmsUserUpdateSchema,
  idSchema,
  idsSchema,
  imageSchema,
  paymentIdSchema,
  uuidSchema,
  validate,
} from '@/validation'
import { uploadFile } from '@/utils'
import {
  adminUserResponse,
  authorResponse,
  cmsBookResponse,
} from '@/utils/response.utils'
import { BadRequest, Internal, NotFound } from '@/errors'
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
  Order,
} from '@/types'
import { Folder, UserRole } from '@/types'
import { UserErrorCode } from '@/types/enums'

// --- READ --- //
export async function getAllBooks(): Promise<
  ReturnType<typeof cmsBookResponse>[]
> {
  const books = await booksDB.getAllBooks()

  return books.map(cmsBookResponse)
}

export async function getAllAuthors(): Promise<
  ReturnType<typeof authorResponse>[]
> {
  const authors = await authorsDB.getAllAuthors()

  return authors.map(authorResponse)
}

export async function getAllOrders(): Promise<Order[]> {
  const orders = await ordersDB.getAllOrders()

  return orders
}

export async function getAllUsers(): Promise<
  ReturnType<typeof adminUserResponse>[]
> {
  const users = await usersDB.getAllUsers()

  return users.map(adminUserResponse)
}

// --- CREATE --- //
export async function addBook(
  book: BookInsert,
): Promise<ReturnType<typeof cmsBookResponse>> {
  const validatedBook = validate(bookInsertSchema, book)
  const newBook = await booksDB.insertBook(validatedBook)

  return cmsBookResponse(newBook)
}

export async function addAuthor(
  author: AuthorInsert,
): Promise<ReturnType<typeof authorResponse>> {
  const validatedAuthor = validate(authorInsertSchema, author)
  const newAuthor = await authorsDB.insertAuthor(validatedAuthor)

  return authorResponse(newAuthor)
}

export async function addUser(
  user: CmsUserInsert,
): Promise<ReturnType<typeof adminUserResponse>> {
  const validatedUser = validate(cmsUserInsertSchema, user)
  const newUser = await usersDB.createUser({
    ...validatedUser,
    uuid: crypto.randomUUID(),
    password: await Bun.password.hash(validatedUser.password),
    verificationToken: null,
    verificationExpires: null,
    passwordResetToken: null,
    passwordResetExpires: null,
  })

  if (!newUser) {
    throw new Internal('Failed to create user')
  }

  return adminUserResponse(newUser)
}

// --- UPDATE --- //
export async function updateBook(
  bookId: number,
  book: BookUpdate,
): Promise<ReturnType<typeof cmsBookResponse>> {
  const validatedId = validate(idSchema, bookId)
  const validatedBook = validate(bookUpdateSchema, book)
  const updatedBook = await booksDB.updateBook(validatedId, validatedBook)

  if (!updatedBook) {
    throw new NotFound(`Book with id ${bookId} not found`)
  }

  return cmsBookResponse(updatedBook)
}

export async function updateAuthor(
  authorId: number,
  author: AuthorUpdate,
): Promise<ReturnType<typeof authorResponse>> {
  const validatedId = validate(idSchema, authorId)
  const validatedAuthor = validate(authorUpdateSchema, author)
  const updatedAuthor = await authorsDB.updateAuthor(
    validatedId,
    validatedAuthor,
  )

  if (!updatedAuthor) {
    throw new NotFound(`Author with id ${authorId} not found`)
  }

  return authorResponse(updatedAuthor)
}

export async function updateOrder(
  paymentId: string,
  fields: CmsOrderUpdate,
): Promise<Order> {
  const validatedId = validate(paymentIdSchema, paymentId)
  const validatedFields = validate(cmsOrderUpdateSchema, fields)
  const updatedOrder = await ordersDB.updateOrder(validatedId, validatedFields)

  if (!updatedOrder) {
    throw new NotFound(`Order with paymentId ${paymentId} not found`)
  }

  return updatedOrder
}

export async function updateUser(
  userUuid: string,
  user: CmsUserUpdate,
): Promise<ReturnType<typeof adminUserResponse>> {
  const validatedUuid = validate(uuidSchema, userUuid)
  const validatedUser = validate(cmsUserUpdateSchema, user)

  const updatedUser = await usersDB.updateUserBy(
    'uuid',
    validatedUuid,
    validatedUser,
  )

  if (!updatedUser) {
    throw new NotFound(`User with uuid ${userUuid} not found`)
  }

  return adminUserResponse(updatedUser)
}

// --- DELETE --- //
export async function hardDeleteBooks(bookIds: number[]): Promise<number[]> {
  const validatedIds = validate(idsSchema, bookIds)
  const deletedIds = await booksDB.hardDeleteBooks(validatedIds)

  return deletedIds
}

export async function hardDeleteAuthors(
  authorIds: number[],
): Promise<number[]> {
  const validatedIds = validate(idsSchema, authorIds)
  const deletedIds = await authorsDB.hardDeleteAuthors(validatedIds)

  return deletedIds
}

export async function softDeleteOrders(input: CmsOrderIds): Promise<number> {
  const { orderIds } = validate(cmsOrderIdsSchema, input)

  return await ordersDB.setOrdersDeleted(orderIds, true)
}

export async function restoreOrders(input: CmsOrderIds): Promise<number> {
  const { orderIds } = validate(cmsOrderIdsSchema, input)

  return await ordersDB.setOrdersDeleted(orderIds, false)
}

export async function restoreUsers(input: CmsUserIds): Promise<number> {
  const { userIds } = validate(cmsUserIdsSchema, input)

  return await usersDB.setUsersDeleted(userIds, false)
}

export async function softDeleteUsers(input: CmsUserIds): Promise<number> {
  const { userIds } = validate(cmsUserIdsSchema, input)

  const activeUsers = (await usersDB.getAllUsers()).filter(
    (user) => !user.deletedAt,
  )

  const usersToDelete = activeUsers.filter((user) => userIds.includes(user.id))
  const deletingAdmins = usersToDelete.filter(
    (user) => user.role === UserRole.Admin,
  )

  if (deletingAdmins.length > 0) {
    const totalAdmins = activeUsers.filter(
      (user) => user.role === UserRole.Admin,
    ).length

    if (totalAdmins - deletingAdmins.length === 0) {
      throw new BadRequest(
        'Cannot delete the last admin. At least one admin must remain in the system.',
        UserErrorCode.LastAdminRequired,
      )
    }
  }

  return await usersDB.setUsersDeleted(userIds, true)
}

// --- UPLOADS --- //
export async function uploadProductImage(
  image: Bun.FormDataEntryValue | null,
): Promise<{ url: string }> {
  if (!(image instanceof File)) {
    throw new BadRequest('Image must be a file', UserErrorCode.InvalidImage)
  }

  validate(imageSchema, image)

  const url = await uploadFile(image, Folder.ProductImages)

  return { url }
}
