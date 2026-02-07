import { Hono } from 'hono'
import {
  cancelPaymentIntent,
  createPaymentIntent,
  retrievePaymentIntent,
} from '@/services'
import { errorHandler } from '@/errors'
import type { PaymentIntentRequest } from '@/types'

export const payments = new Hono()

payments.get('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentIntent = await retrievePaymentIntent(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})

payments.post('/', async (c) => {
  try {
    const paymentIntentRequest = await c.req.json<PaymentIntentRequest>()
    const { session, amount } = await createPaymentIntent(paymentIntentRequest)

    return c.json({ session, amount })
  } catch (error) {
    return errorHandler(c, error)
  }
})

payments.delete('/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')
    const paymentIntent = await cancelPaymentIntent(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return errorHandler(c, error)
  }
})
