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
import { extractCustomerFields } from '@/utils'
import { emailQueue } from '@/queues'
import { jobOpts, QUEUE, defaultCurrency } from '@/constants'
import { BadRequest, Internal, NotFound } from '@/errors'
import type {
  Order,
  OrderUpdate,
  OrderCreateRequest,
  OrderItem,
  PaymentIntentCreate,
  SendEmailProps,
} from '@/types'
import { OrderStatus } from '@/types'

const stripe = new Stripe(env.stripeSecret!)

export async function createPaymentIntent(createRequest: PaymentIntentCreate) {
  return stripe.paymentIntents.create(createRequest)
}

export async function retrievePaymentIntent(paymentId: string) {
  return stripe.paymentIntents.retrieve(paymentId)
}

export async function cancelPaymentIntent(paymentId: string) {
  const cancelledIntent = await stripe.paymentIntents.cancel(paymentId)

  // Update order status in database
  await ordersDB.updateOrder(paymentId, {
    paymentIntentStatus: 'canceled',
    orderStatus: OrderStatus.Canceled,
    updatedAt: new Date().toISOString(),
  })

  return cancelledIntent
}

export async function getOrderByPaymentId(paymentId: string) {
  const order = await ordersDB.getOrderByPaymentId(paymentId)

  if (!order) {
    throw new NotFound('Order not found')
  }

  return order
}

export async function processStripeWebhook(
  payload: string,
  signature: string,
): Promise<{ received: boolean }> {
  if (!env.stripeWebhookSecret) {
    throw new Internal('Stripe webhook secret not configured')
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      env.stripeWebhookSecret,
    )
  } catch (err) {
    throw new BadRequest(
      `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object
      const existingOrder = await ordersDB.getOrderByPaymentId(paymentIntent.id)

      if (!existingOrder) {
        void log.warn('Webhook received for missing order', {
          paymentId: paymentIntent.id,
          eventType: event.type,
        })
        break
      }

      const wasAlreadyPaid = existingOrder.orderStatus === OrderStatus.Paid

      const updatedOrder = await ordersDB.updateOrder(paymentIntent.id, {
        ...extractCustomerFields(paymentIntent),
        paymentIntentStatus: paymentIntent.status,
        orderStatus: OrderStatus.Paid,
        updatedAt: new Date().toISOString(),
      })

      if (!wasAlreadyPaid && updatedOrder?.email && updatedOrder.firstName) {
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
              paymentId: paymentIntent.id,
            })
          })
      }

      void log.info('Payment succeeded via webhook', {
        paymentId: paymentIntent.id,
        wasAlreadyPaid,
      })
      break
    }

    case 'payment_intent.amount_capturable_updated': {
      const paymentIntent = event.data.object
      const existingOrder = await ordersDB.getOrderByPaymentId(paymentIntent.id)

      if (!existingOrder) {
        void log.warn('Webhook received for missing order', {
          paymentId: paymentIntent.id,
          eventType: event.type,
        })
        break
      }

      await ordersDB.updateOrder(paymentIntent.id, {
        ...extractCustomerFields(paymentIntent),
        paymentIntentStatus: paymentIntent.status,
        orderStatus: OrderStatus.Captured,
        updatedAt: new Date().toISOString(),
      })

      void log.info('Payment capturable via webhook', {
        paymentId: paymentIntent.id,
      })

      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object
      await ordersDB.updateOrder(paymentIntent.id, {
        paymentIntentStatus: paymentIntent.status,
        updatedAt: new Date().toISOString(),
      })

      void log.warn('Payment failed via webhook', {
        paymentId: paymentIntent.id,
        error: paymentIntent.last_payment_error?.message,
      })
      break
    }

    case 'payment_intent.canceled': {
      const paymentIntent = event.data.object
      await ordersDB.updateOrder(paymentIntent.id, {
        paymentIntentStatus: 'canceled',
        orderStatus: OrderStatus.Canceled,
        updatedAt: new Date().toISOString(),
      })

      void log.info('Payment canceled via webhook', {
        paymentId: paymentIntent.id,
      })
      break
    }

    case 'payment_intent.requires_action': {
      const paymentIntent = event.data.object
      await ordersDB.updateOrder(paymentIntent.id, {
        paymentIntentStatus: 'requires_action',
        updatedAt: new Date().toISOString(),
      })

      void log.info('Payment requires action via webhook', {
        paymentId: paymentIntent.id,
      })
      break
    }

    default:
      void log.info(`Unhandled webhook event type: ${event.type}`)
  }

  return { received: true }
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
      orderStatus: OrderStatus.Pending,
      total,
      items: orderItems,
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      address: null,
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

  if (!updatedOrder) {
    throw new Internal('Failed to update order')
  }

  return updatedOrder
}
