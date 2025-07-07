import { booksDB, ordersDB, usersDB } from '../repositories'

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
