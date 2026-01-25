import { Stripe } from 'stripe'
import { env } from '@/config'
import { booksDB, ordersDB } from '@/repositories'
import {
  checkoutCartSchema,
  orderInsertSchema,
  paymentIdSchema,
  validate,
} from '@/validation'
import { extractCustomerFields } from '@/utils'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { defaultCurrency, jobOpts, QUEUE, stripeShipping } from '@/constants'
import { BadRequest, Internal, NotFound } from '@/errors'
import type {
  CheckoutCart,
  OrderInsert,
  OrderItem,
  SendEmailProps,
} from '@/types'
import { OrderStatus } from '@/types'

const stripe = new Stripe(env.stripeSecret!)

export async function retrievePaymentIntent(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  return stripe.paymentIntents.retrieve(validatedId)
}

export async function cancelPaymentIntent(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  const cancelledIntent = await stripe.paymentIntents.cancel(validatedId)

  await ordersDB.updateOrder(validatedId, {
    paymentIntentStatus: 'canceled',
    orderStatus: OrderStatus.Canceled,
  })

  return cancelledIntent
}

export async function getOrderByPaymentId(paymentId: string) {
  const validatedId = validate(paymentIdSchema, paymentId)
  const order = await ordersDB.getOrderByPaymentId(validatedId)

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
    event = await stripe.webhooks.constructEventAsync(
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
      })

      void log.info('Payment requires action via webhook', {
        paymentId: paymentIntent.id,
      })
      break
    }

    case 'payment_intent.processing': {
      const paymentIntent = event.data.object
      await ordersDB.updateOrder(paymentIntent.id, {
        paymentIntentStatus: 'processing',
        orderStatus: OrderStatus.Pending,
      })

      void log.info('Payment processing via webhook', {
        paymentId: paymentIntent.id,
      })
      break
    }

    default:
      void log.info(`Unhandled webhook event type: ${event.type}`)
  }

  return { received: true }
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
      paymentIntentStatus: paymentIntent.status,
      orderStatus: OrderStatus.Pending,
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
