import { Hono } from 'hono'
import { getUserOrders } from '@/services'
import { errorHandler } from '@/errors'

type Variables = {
  jwtPayload: {
    uuid: string
  }
}

export const orders = new Hono<{ Variables: Variables }>()

orders.get('/', async (c) => {
  try {
    const { uuid } = c.get('jwtPayload')
    const userOrders = await getUserOrders(uuid)

    return c.json(userOrders)
  } catch (error) {
    return errorHandler(c, error)
  }
})
