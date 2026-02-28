import { ordersDB, usersDB } from '@/repositories'
import { userMessage } from '@/constants'
import { NotFound } from '@/errors'
import type { Order } from '@/types'

export async function getUserOrders(uuid: string): Promise<Order[]> {
  const user = await usersDB.getUserBy('uuid', uuid)

  if (!user) {
    throw new NotFound(userMessage.getError)
  }

  return await ordersDB.getOrdersByEmail(user.email)
}
