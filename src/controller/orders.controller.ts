import { Hono } from 'hono'
import {
  retrievePaymentIntent,
  cancelPaymentIntent,
  createOrderWithPayment,
  updateOrder,
  getOrderByPaymentId,
} from '@/services'
import { errorHandler } from '@/errors'
import type { OrderUpdate, OrderCreateRequest } from '@/types'

export const orders = new Hono()

orders.get('/payment-intents/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentIntent = await retrievePaymentIntent(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.delete('/payment-intents/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentIntent = await cancelPaymentIntent(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.get('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const order = await getOrderByPaymentId(paymentId)

    return c.json(order)
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.post('/', async (c) => {
  try {
    const orderRequest = await c.req.json<OrderCreateRequest>()
    const { clientSecret, amount } = await createOrderWithPayment(orderRequest)

    return c.json({ clientSecret, amount })
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.patch('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const { fields } = await c.req.json<Pick<OrderUpdate, 'fields'>>()
    const updatedOrder = await updateOrder({ paymentId, fields } as OrderUpdate)

    return c.json(updatedOrder)
  } catch (error) {
    return errorHandler(c, error)
  }
})
