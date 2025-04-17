import { Hono } from 'hono'
import { Stripe } from 'stripe'
import { env } from '../config'
import {
  validate,
  formatZodError,
  orderCreateSchema,
  orderUpdateSchema,
} from '../validation'
import * as DB from '../repository'
import * as Errors from '../errors'
import type { Order, OrderUpdate, PaymentIntentCreate } from '../types'

export const orders = new Hono()
const stripe = new Stripe(env.stripeSecret!)

orders.post('/payment-intent', async (c) => {
  try {
    const createRequest = await c.req.json<PaymentIntentCreate>()

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

orders.post('/create', async (c) => {
  try {
    const orderRequest = await c.req.json<Order>()

    const validationResult = validate(orderCreateSchema, orderRequest)

    if (!validationResult.success) {
      return c.json({ error: formatZodError(validationResult.error) }, 400)
    }

    const validatedOrder = validationResult.data

    const createdOrder = await DB.createOrder(validatedOrder)

    if (!createdOrder) {
      throw new Errors.BadRequest('Failed to create order')
    }

    return c.json({ paymentId: createdOrder.paymentId })
  } catch (error) {
    return Errors.Handler(c, error)
  }
})

orders.patch('/update', async (c) => {
  try {
    const orderUpdateRequest = await c.req.json<OrderUpdate>()

    const validationResult = validate(orderUpdateSchema, orderUpdateRequest)

    if (!validationResult.success) {
      return c.json({ error: formatZodError(validationResult.error) }, 400)
    }

    const { paymentId, fields } = validationResult.data

    const updatedOrder = await DB.updateOrder(paymentId, {
      ...fields,
      updatedAt: new Date().toISOString(),
    })

    if (!updatedOrder) {
      throw new Errors.BadRequest('Failed to update order')
    }

    return c.json(updatedOrder)
  } catch (error) {
    return Errors.Handler(c, error)
  }
})
