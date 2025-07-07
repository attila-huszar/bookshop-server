import { Hono } from 'hono'
import { getAllBooks, getAllOrders, getAllUsers } from '../services'
import { errorHandler } from '../errors'

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
