import { Hono } from 'hono'
import { Stripe } from 'stripe'
import { env } from '../config'
import { validate } from '../services'
import * as DB from '../repository'
import * as Errors from '../errors'
import type { OrderRequest, PaymentIntentCreateRequest } from '../types'

export const orders = new Hono()

const stripe = new Stripe(env.stripeSecret)

orders.post('/create', async (c) => {
  try {
    const createRequest = await c.req.json<OrderRequest>()

    const orderValidated = await validate('orderCreate', createRequest)

    const orderCreated = await DB.createOrder(orderValidated)

    if (!orderCreated) {
      throw new Error('Order record not created')
    }

    return c.json({ paymentId: orderCreated.paymentId })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

orders.patch('/update', async (c) => {
  try {
    const updateRequest = await c.req.json<OrderRequest>()

    const orderValidated = await validate('orderUpdate', updateRequest)

    const orderUpdated = await DB.updateOrder(orderValidated.paymentId, {
      orderStatus: orderValidated.orderStatus,
      updatedAt: new Date().toISOString(),
    })

    if (!orderUpdated) {
      throw new Error('Order record not updated')
    }

    return c.json(orderUpdated)
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

orders.get('/payment-intent/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

orders.delete('/payment-intent/:paymentId', async (c) => {
  try {
    const paymentId = c.req.param('paymentId')

    const paymentIntent = await stripe.paymentIntents.cancel(paymentId)

    return c.json(paymentIntent)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
