import { Stripe } from 'stripe'
import { env } from '@/config'
import { booksDB, ordersDB } from '@/repositories'
import {
  orderInsertSchema,
  paymentIdSchema,
  paymentIntentRequestSchema,
  validate,
} from '@/validation'
import { log } from '@/libs'
import { defaultCurrency } from '@/constants'
import { Internal, NotFound } from '@/errors'
import type {
  OrderInsert,
  OrderItem,
  PaymentIntentRequest,
  PaymentSession,
  PublicUser,
} from '@/types'

const stripe = new Stripe(env.stripeSecret!)

export async function retrievePaymentIntent(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  return stripe.paymentIntents.retrieve(validatedId)
}

export async function createPaymentIntent(
  paymentIntentRequest: PaymentIntentRequest,
  user: PublicUser | null,
): Promise<PaymentSession> {
  const validatedRequest = validate(
    paymentIntentRequestSchema,
    paymentIntentRequest,
  )

  const items: OrderItem[] = []
  let total = 0

  const books = await Promise.all(
    validatedRequest.items.map((item) => booksDB.getBookById(item.id)),
  )

  for (let index = 0; index < validatedRequest.items.length; index++) {
    const item = validatedRequest.items[index]!
    const book = books[index]

    if (!book) {
      throw new NotFound(
        `Book not found during payment intent creation: ID ${item.id}`,
      )
    }

    const itemTotal =
      item.quantity * book.price * (1 - (book.discount ?? 0) / 100)
    total += itemTotal

    items.push({
      id: book.id,
      title: book.title,
      author: book.author,
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

    const orderData: OrderInsert = {
      paymentId: stripePaymentId,
      paymentStatus: 'processing',
      currency: defaultCurrency,
      items,
      total,
      ...(user ?? {}),
    }

    const validatedOrderData = validate(orderInsertSchema, orderData)
    const createdOrder = await ordersDB.createOrder(validatedOrderData)

    if (!createdOrder) {
      throw new Internal('Failed to create order in database')
    }

    return {
      session: paymentIntent.client_secret,
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

export async function cancelPaymentIntent(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  const cancelledIntent = await stripe.paymentIntents.cancel(validatedId)

  await ordersDB.updateOrder(validatedId, {
    paymentStatus: 'canceled',
  })

  return cancelledIntent
}
