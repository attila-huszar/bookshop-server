import { Stripe } from 'stripe'
import { env } from '@/config'
import { booksDB, ordersDB } from '@/repositories'
import {
  validate,
  orderCreateSchema,
  orderCreateRequestSchema,
  orderUpdateSchema,
} from '@/validation'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { jobOpts, QUEUE, defaultCurrency } from '@/constants'
import { Internal, NotFound } from '@/errors'
import type {
  Order,
  OrderUpdate,
  OrderCreateRequest,
  OrderItem,
  PaymentIntentCreate,
  SendEmailProps,
  OrderStatus,
} from '@/types'

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
  orderRequest.firstName ??= null
  orderRequest.lastName ??= null
  orderRequest.email ??= null
  orderRequest.address ??= null

  const validatedOrder = validate(orderCreateSchema, orderRequest)

  const createdOrder = await ordersDB.createOrder(validatedOrder)

  if (!createdOrder) {
    throw new Internal('Failed to create order')
  }

  return { paymentId: createdOrder.paymentId }
}

export async function createOrderWithPayment(
  orderRequest: OrderCreateRequest,
): Promise<{ clientSecret: string; amount: number }> {
  const validatedRequest = validate(orderCreateRequestSchema, orderRequest)

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
      description: `Order with ${orderItems.length} item(s)`,
    })

    if (!paymentIntent?.client_secret) {
      throw new Internal(
        'Failed to create payment intent: missing client secret',
      )
    }

    const clientSecret = paymentIntent.client_secret
    const paymentIdMatch = /^pi_[^_]+/.exec(clientSecret)

    if (!paymentIdMatch) {
      throw new Internal('Invalid client secret format from Stripe')
    }

    stripePaymentId = paymentIdMatch[0]

    const orderData = {
      paymentId: stripePaymentId,
      paymentIntentStatus: paymentIntent.status,
      orderStatus: 'PENDING' as OrderStatus,
      total,
      items: orderItems,
      firstName: validatedRequest.firstName,
      lastName: validatedRequest.lastName,
      email: validatedRequest.email,
      phone: validatedRequest.phone,
      address: validatedRequest.address,
    }

    const createdOrder = await ordersDB.createOrder(orderData)

    if (!createdOrder) {
      throw new Internal('Failed to create order in database')
    }

    return {
      clientSecret,
      amount: amountInCents,
    }
  } catch (error) {
    if (stripePaymentId) {
      try {
        await stripe.paymentIntents.cancel(stripePaymentId)
        void log.warn(
          'Rolled back Stripe payment intent after order creation failed',
          {
            paymentId: stripePaymentId,
          },
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

export async function updateOrder(orderUpdateRequest: OrderUpdate) {
  const { paymentId, fields } = validate(orderUpdateSchema, orderUpdateRequest)

  const updatedOrder = await ordersDB.updateOrder(paymentId, {
    ...fields,
    updatedAt: new Date().toISOString(),
  })

  if (!updatedOrder?.email || !updatedOrder.firstName) {
    throw new Internal('Failed to update order')
  }

  void emailQueue
    .add(
      QUEUE.EMAIL.JOB.ORDER_CONFIRMATION,
      {
        type: QUEUE.EMAIL.JOB.ORDER_CONFIRMATION,
        toAddress: updatedOrder.email,
        toName: updatedOrder.firstName,
        order: updatedOrder,
      } satisfies SendEmailProps,
      jobOpts,
    )
    .catch((error: Error) => {
      void log.error('[QUEUE] Order confirmation email queueing failed', {
        error,
      })
    })

  return updatedOrder
}
