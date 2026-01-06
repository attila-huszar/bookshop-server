import { Hono } from 'hono'
import {
  retrievePaymentIntent,
  cancelPaymentIntent,
  createOrder,
  getOrderByPaymentId,
} from '@/services'
import { errorHandler } from '@/errors'
import type { CheckoutCart } from '@/types'

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
    const orderRequest = await c.req.json<CheckoutCart>()
    const { paymentSession, amount } = await createOrder(orderRequest)

    return c.json({ paymentSession, amount })
  } catch (error) {
    return errorHandler(c, error)
  }
})
