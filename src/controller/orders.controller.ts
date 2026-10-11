import { Hono } from 'hono'
import { getUserOrders } from '@/services'
import { orderResponse } from '@/utils/response.utils'
import { API } from '@/constants'
import type { AuthVariables } from '@/types'

export const orders = new Hono<{ Variables: AuthVariables }>()

orders.get(API.orders.root, async (c) => {
  const userOrders = await getUserOrders(c.get('authUser'))

  return c.json(userOrders.map(orderResponse))
})
