import { Stripe } from 'stripe'
import { env } from '@/config'
import { booksDB, ordersDB } from '@/repositories'
import {
  checkoutCartSchema,
  orderInsertSchema,
  paymentIdSchema,
  validate,
} from '@/validation'
import { log } from '@/libs'
import { defaultCurrency, stripeShipping } from '@/constants'
import { Internal, NotFound } from '@/errors'
import type { CheckoutCart, OrderInsert, OrderItem, OrderUpdate } from '@/types'

const stripe = new Stripe(env.stripeSecret!)

export async function retrievePaymentIntent(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  return stripe.paymentIntents.retrieve(validatedId)
}

export async function cancelPaymentIntent(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  const cancelledIntent = await stripe.paymentIntents.cancel(validatedId)

  await ordersDB.updateOrder(validatedId, {
    paymentStatus: 'canceled',
  })

  return cancelledIntent
}

export async function getOrder(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  const order = await ordersDB.getOrder(validatedId)

  if (!order) {
    throw new NotFound('Order not found')
  }

  return order
}

export async function createOrder(
  orderRequest: CheckoutCart,
): Promise<{ paymentSession: string; amount: number }> {
  const validatedRequest = validate(checkoutCartSchema, orderRequest)

  const orderItems: OrderItem[] = []
  let total = 0

  for (const item of validatedRequest.items) {
    const book = await booksDB.getBookById(item.id)

    if (!book) {
      throw new NotFound(`Book with ID ${item.id} not found`)
    }

    const itemTotal =
      item.quantity * book.price * (1 - (book.discount ?? 0) / 100)
    total += itemTotal

    orderItems.push({
      id: book.id,
      title: book.title,
      price: book.price,
      discount: book.discount ?? 0,
      quantity: item.quantity,
    })
  }

  total = Number(total.toFixed(2))

  const amountInCents = Math.round(total * 100)

  let stripePaymentId: string | null = null

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: defaultCurrency.toLowerCase(),
    })

    if (!paymentIntent?.client_secret) {
      throw new Internal(
        'Failed to create payment intent: missing client secret',
      )
    }

    stripePaymentId = paymentIntent.id

    const order: OrderInsert = {
      paymentId: stripePaymentId,
      paymentStatus: paymentIntent.status,
      total,
      currency: defaultCurrency,
      items: orderItems,
      firstName: '',
      lastName: '',
      email: '',
      shipping: stripeShipping,
    }

    const validatedOrderData = validate(orderInsertSchema, order)
    const createdOrder = await ordersDB.createOrder(validatedOrderData)

    if (!createdOrder) {
      throw new Internal('Failed to create order in database')
    }

    return {
      paymentSession: paymentIntent.client_secret,
      amount: amountInCents,
    }
  } catch (error) {
    if (stripePaymentId) {
      try {
        await stripe.paymentIntents.cancel(stripePaymentId)
        void log.warn(
          'Rolled back Stripe payment intent after order creation failed',
          { paymentId: stripePaymentId },
        )
      } catch (rollbackError) {
        void log.error('Failed to rollback Stripe payment intent', {
          paymentId: stripePaymentId,
          rollbackError,
        })
      }
    }
    throw error
  }
}

export async function updateOrderFromWebhook(
  paymentIntentId: string,
  data: OrderUpdate,
  eventType: string,
) {
  const existingOrder = await ordersDB.getOrder(paymentIntentId)

  if (!existingOrder) {
    void log.warn('Failed to find order for payment intent', {
      paymentId: paymentIntentId,
      eventType,
    })
    return null
  }

  const updateData: OrderUpdate = { ...data }
  const justPaid = data.paymentStatus === 'succeeded' && !existingOrder.paidAt

  if (justPaid) {
    updateData.paidAt = new Date()
  }

  const updatedOrder = await ordersDB.updateOrder(paymentIntentId, updateData)
  return updatedOrder ? { ...updatedOrder, justPaid } : null
}
