import { Stripe } from 'stripe'
import { env } from '@/config'
import { booksDB, ordersDB } from '@/repositories'
import {
  orderInsertSchema,
  paymentIdSchema,
  paymentIntentRequestSchema,
  validate,
} from '@/validation'
import {
  AdminNotificationEnum,
  sendAdminNotificationEmail,
  toIsoString,
} from '@/utils'
import { log } from '@/libs'
import { defaultCurrency } from '@/constants'
import { BadRequest, Internal, NotFound, Unauthorized } from '@/errors'
import type {
  Order,
  OrderInsert,
  OrderItem,
  PaymentIntentRequest,
  PaymentSession,
  PaymentSyncStatus,
  PublicUser,
} from '@/types'

const stripe = new Stripe(env.stripeSecret!)

type PaymentAccess = {
  paymentSessionId?: string
  userEmail?: string
}

async function authorizePaymentAccess(
  paymentId: string,
  access?: PaymentAccess,
): Promise<Order> {
  const order = await ordersDB.getOrder(paymentId)

  if (!order) {
    throw new Unauthorized('Unauthorized payment access')
  }

  const paymentSessionId = access?.paymentSessionId
  const userEmail = access?.userEmail
  const orderEmail = order.email

  if (paymentSessionId === paymentId) return order

  if (userEmail && orderEmail?.toLowerCase() === userEmail.toLowerCase()) {
    return order
  }

  throw new Unauthorized('Unauthorized payment access')
}

export async function retrievePaymentIntent(
  paymentId: string,
  access?: PaymentAccess,
) {
  const validatedId = validate(paymentIdSchema, paymentId)
  await authorizePaymentAccess(validatedId, access)
  return await stripe.paymentIntents.retrieve(validatedId)
}

export async function retrieveOrderSyncStatus(
  paymentId: string,
  access?: PaymentAccess,
): Promise<PaymentSyncStatus> {
  const validatedId = validate(paymentIdSchema, paymentId)
  const order = await authorizePaymentAccess(validatedId, access)

  return {
    paymentId: order.paymentId,
    paymentStatus: order.paymentStatus,
    amount: Math.round(order.total * 100),
    currency: order.currency,
    receiptEmail: order.email ?? null,
    shipping: order.shipping ?? null,
    finalizedAt: toIsoString(order.paidAt),
    webhookUpdatedAt: toIsoString(order.updatedAt),
  }
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
      ...(user && {
        metadata: {
          userEmail: user.email,
          userName: `${user.firstName} ${user.lastName}`.trim(),
        },
      }),
    })

    if (!paymentIntent?.client_secret) {
      throw new Internal(
        'Failed to create payment intent: missing client secret',
      )
    }

    stripePaymentId = paymentIntent.id

    const userWithShipping = user
      ? {
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          shipping: {
            name: `${user.firstName} ${user.lastName}`,
            address: user.address ?? undefined,
            phone: user.phone ?? undefined,
          },
        }
      : {}

    const orderData: OrderInsert = {
      paymentId: stripePaymentId,
      paymentStatus: paymentIntent.status,
      currency: defaultCurrency,
      items,
      total,
      ...userWithShipping,
    }

    const validatedOrderData = validate(orderInsertSchema, orderData)
    const createdOrder = await ordersDB.createOrder(validatedOrderData)

    if (!createdOrder) {
      throw new Internal('Failed to create order in database')
    }

    sendAdminNotificationEmail({
      order: createdOrder,
      type: AdminNotificationEnum.Created,
    })

    return {
      paymentId: stripePaymentId,
      paymentToken: paymentIntent.client_secret,
      amount: amountInCents,
    }
  } catch (error) {
    if (stripePaymentId) {
      sendAdminNotificationEmail({
        type: AdminNotificationEnum.Error,
        order: {
          paymentId: stripePaymentId,
          items,
          total,
          currency: defaultCurrency,
          paymentStatus: 'requires_action',
        },
      })

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

export async function cancelPaymentIntent(
  paymentId: string,
  access?: PaymentAccess,
) {
  const validatedId = validate(paymentIdSchema, paymentId)
  const order = await authorizePaymentAccess(validatedId, access)

  if (order.paymentStatus === 'canceled') {
    throw new BadRequest('Payment already canceled')
  }

  if (order.paymentStatus === 'succeeded') {
    throw new BadRequest('Cannot cancel succeeded payment')
  }

  const cancelledIntent = await stripe.paymentIntents.cancel(validatedId)

  await ordersDB.updateOrder(validatedId, {
    paymentStatus: 'canceled',
  })

  return cancelledIntent
}
