import { Stripe } from 'stripe'
import { env } from '../config'
import { ordersDB } from '../repositories'
import { validate, orderCreateSchema, orderUpdateSchema } from '../validation'
import { Internal } from '../errors'
import type { Order, OrderUpdate, PaymentIntentCreate } from '../types'

const stripe = new Stripe(env.stripeSecret!)

export async function createPaymentIntent(createRequest: PaymentIntentCreate) {
  return stripe.paymentIntents.create(createRequest)
}

export async function retrievePaymentIntent(paymentId: string) {
  return stripe.paymentIntents.retrieve(paymentId)
}

export async function cancelPaymentIntent(paymentId: string) {
  return stripe.paymentIntents.cancel(paymentId)
}

export async function createOrder(orderRequest: Order) {
  const validationResult = validate(orderCreateSchema, orderRequest)

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const validatedOrder = validationResult.data
  const createdOrder = await ordersDB.createOrder(validatedOrder)

  if (!createdOrder) {
    return { error: new Internal('Failed to create order') }
  }

  return { paymentId: createdOrder.paymentId }
}

export async function updateOrder(orderUpdateRequest: OrderUpdate) {
  const validationResult = validate(orderUpdateSchema, orderUpdateRequest)

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const { paymentId, fields } = validationResult.data
  const updatedOrder = await ordersDB.updateOrder(paymentId, {
    ...fields,
    updatedAt: new Date().toISOString(),
  })

  if (!updatedOrder) {
    return { error: new Internal('Failed to update order') }
  }

  return updatedOrder
}
