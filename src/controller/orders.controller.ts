import { Hono } from 'hono'
import {
  retrievePaymentIntent,
  cancelPaymentIntent,
  createOrderWithPayment,
  updateOrder,
} from '@/services'
import { errorHandler } from '@/errors'
import type { OrderUpdate, OrderCreateRequest } from '@/types'

export const orders = new Hono()

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

orders.post('/create-with-payment', async (c) => {
  try {
    const orderRequest = await c.req.json<OrderCreateRequest>()
    const { clientSecret, amount } = await createOrderWithPayment(orderRequest)

    return c.json({ clientSecret, amount })
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
