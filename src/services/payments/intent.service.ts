import { booksDB, ordersDB } from '@/repositories'
import {
  orderInsertSchema,
  paymentIdSchema,
  paymentIntentRequestSchema,
  validate,
} from '@/validation'
import { log } from '@/libs'
import { enqueueEmail } from '@/queues'
import { defaultCurrency } from '@/constants'
import { BadRequest, Internal, NotFound } from '@/errors'
import { AdminNotification } from '@/types'
import type {
  OrderInsert,
  OrderItem,
  PaymentIntentRequest,
  PaymentSession,
  PublicUser,
} from '@/types'
import { authorizePaymentAccess, type PaymentAccess, stripe } from './shared'

async function buildOrderItemsAndTotal(
  paymentIntentRequest: PaymentIntentRequest,
): Promise<{ items: OrderItem[]; total: number }> {
  const items: OrderItem[] = []
  let total = 0

  const books = await Promise.all(
    paymentIntentRequest.items.map((item) => booksDB.getBookById(item.id)),
  )

  for (let index = 0; index < paymentIntentRequest.items.length; index++) {
    const item = paymentIntentRequest.items[index]!
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
      imgUrl: book.imgUrl ?? '',
      price: book.price,
      discount: book.discount ?? 0,
      quantity: item.quantity,
    })
  }

  return {
    items,
    total: Number(total.toFixed(2)),
  }
}

function assertExpectedTotal(total: number, expectedTotal: number): void {
  if (Math.abs(total - expectedTotal) > 0.05) {
    throw new BadRequest(
      'Prices have been updated in your cart. Please review before checkout.',
      'PriceConflict',
      409,
    )
  }
}

function buildUserOrderIdentity(user: PublicUser | null) {
  if (!user) return {}

  return {
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
}

async function rollbackFailedOrderCreation(paymentId: string): Promise<void> {
  try {
    await stripe.paymentIntents.cancel(paymentId)
    void log.warn(
      'Rolled back Stripe payment intent after order creation failed',
      {
        paymentId,
      },
    )
  } catch (rollbackError) {
    void log.error('Failed to rollback Stripe payment intent', {
      paymentId,
      rollbackError,
    })
  }
}

function notifyAdminOrderCreationFailed(args: {
  paymentId: string
  items: OrderItem[]
  total: number
}): void {
  enqueueEmail('adminPaymentNotification', {
    notificationType: AdminNotification.Error,
    order: {
      paymentId: args.paymentId,
      items: args.items,
      total: args.total,
      currency: defaultCurrency,
      paymentStatus: 'requires_action',
    },
  })
}

export async function retrievePaymentIntent(
  paymentId: string,
  access?: PaymentAccess,
) {
  const validatedId = validate(paymentIdSchema, paymentId)
  await authorizePaymentAccess(validatedId, access)
  return await stripe.paymentIntents.retrieve(validatedId)
}

export async function createPaymentIntent(
  paymentIntentRequest: PaymentIntentRequest,
  user: PublicUser | null,
): Promise<PaymentSession> {
  const validatedRequest = validate(
    paymentIntentRequestSchema,
    paymentIntentRequest,
  )
  const { items, total } = await buildOrderItemsAndTotal(validatedRequest)

  assertExpectedTotal(total, validatedRequest.expectedTotal)

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

    const orderData: OrderInsert = {
      paymentId: stripePaymentId,
      paymentStatus: paymentIntent.status,
      currency: defaultCurrency,
      items,
      total,
      ...buildUserOrderIdentity(user),
    }

    const validatedOrderData = validate(orderInsertSchema, orderData)
    const createdOrder = await ordersDB.createOrder(validatedOrderData)

    if (!createdOrder) {
      throw new Internal('Failed to create order in database')
    }

    enqueueEmail('adminPaymentNotification', {
      order: createdOrder,
      notificationType: AdminNotification.Created,
    })

    return {
      paymentId: stripePaymentId,
      paymentToken: paymentIntent.client_secret,
      amount: amountInCents,
    }
  } catch (error) {
    if (stripePaymentId) {
      notifyAdminOrderCreationFailed({
        paymentId: stripePaymentId,
        items,
        total,
      })
      await rollbackFailedOrderCreation(stripePaymentId)
    }
    throw error
  }
}
