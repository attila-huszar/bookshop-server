import { Hono } from 'hono'
import {
  cancelPaymentIntent,
  createOrder,
  getOrder,
  retrievePaymentIntent,
} from '@/services'
import { errorHandler } from '@/errors'
import type { PaymentIntentRequest } from '@/types'

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
    const order = await getOrder(paymentId)

    return c.json(order)
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.post('/', async (c) => {
  try {
    const paymentIntentRequest = await c.req.json<PaymentIntentRequest>()
    const { paymentSession, amount } = await createOrder(paymentIntentRequest)

    return c.json({ paymentSession, amount })
  } catch (error) {
    return errorHandler(c, error)
  }
})
