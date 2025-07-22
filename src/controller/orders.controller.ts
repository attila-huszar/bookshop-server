import { Hono } from 'hono'
import {
  createPaymentIntent,
  retrievePaymentIntent,
  cancelPaymentIntent,
  createOrder,
  updateOrder,
} from '@/services'
import { errorHandler } from '@/errors'
import type { Order, OrderUpdate, PaymentIntentCreate } from '@/types'

export const orders = new Hono()

orders.post('/payment-intent', async (c) => {
  try {
    const createRequest = await c.req.json<PaymentIntentCreate>()
    const paymentIntent = await createPaymentIntent(createRequest)

    return c.json({ clientSecret: paymentIntent.client_secret })
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.get('/payment-intent/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentIntent = await retrievePaymentIntent(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.delete('/payment-intent/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentIntent = await cancelPaymentIntent(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.post('/create', async (c) => {
  try {
    const orderRequest = await c.req.json<Order>()
    const { paymentId } = await createOrder(orderRequest)

    return c.json({ paymentId })
  } catch (error) {
    return errorHandler(c, error)
  }
})

orders.patch('/update', async (c) => {
  try {
    const orderUpdateRequest = await c.req.json<OrderUpdate>()
    const updatedOrder = await updateOrder(orderUpdateRequest)

    return c.json(updatedOrder)
  } catch (error) {
    return errorHandler(c, error)
  }
})
