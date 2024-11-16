import { Hono } from 'hono'
import { Stripe } from 'stripe'
import { env } from '../config'
import * as Errors from '../errors'
import type { PaymentIntentCreateRequest } from '../types'

export const orders = new Hono()

const stripe = new Stripe(env.stripeSecret)

orders.post('/create', (c) => {
  try {
    return c.json({})
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

orders.put('/update', (c) => {
  try {
    return c.json({})
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

orders.post('/payment-intent', async (c) => {
  try {
    const createRequest = await c.req.json<PaymentIntentCreateRequest>()

    const paymentIntent = await stripe.paymentIntents.create(createRequest)

    return c.json({ clientSecret: paymentIntent.client_secret })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

orders.get('/payment-intent', (c) => {
  try {
    return c.json({})
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

orders.delete('/payment-intent', (c) => {
  try {
    return c.json({})
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
