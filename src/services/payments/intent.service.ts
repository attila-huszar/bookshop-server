import { booksDB, ordersDB } from '@/repositories'
import {
  orderInsertSchema,
  paymentIntentRequestSchema,
  validate,
} from '@/validation'
import { log, stripe } from '@/libs'
import { enqueueEmail } from '@/queues'
import { defaultCurrency, paymentMessage } from '@/constants'
import { BadRequest, Internal, NotFound } from '@/errors'
import { AdminNotification } from '@/types'
import type {
  OrderInsert,
  OrderItem,
  PaymentIntentRequest,
  PaymentSession,
  PublicUser,
  StripePaymentIntent,
} from '@/types'
import { type PaymentAccess, resolveAuthorizedPayment } from './shared'

async function buildOrderItemsAndTotal(
  paymentIntentRequest: PaymentIntentRequest,
): Promise<{ items: OrderItem[]; total: number }> {
  const items: OrderItem[] = []
  let totalCents = 0

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

    const priceCents = Math.round(book.price * 100)
    const itemTotalCents = Math.round(
      item.quantity * priceCents * (1 - (book.discount ?? 0) / 100),
    )
    totalCents += itemTotalCents

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
    total: totalCents / 100,
  }
}

function assertExpectedTotal(total: number, expectedTotal: number): void {
  if (Math.abs(total - expectedTotal) > 0.05) {
    throw new BadRequest(
      paymentMessage.priceUpdatedInCart,
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
  paymentStatus: StripePaymentIntent['status']
}): void {
  enqueueEmail('adminPaymentNotification', {
    notificationType: AdminNotification.Error,
    order: {
      paymentId: args.paymentId,
      items: args.items,
      total: args.total,
      currency: defaultCurrency,
      paymentStatus: args.paymentStatus,
    },
  })
}

export async function retrievePaymentIntent(
  paymentId: string,
  access?: PaymentAccess,
) {
  const { validatedId } = await resolveAuthorizedPayment({ paymentId, access })
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
    throw new Internal('Failed to create payment intent: missing client secret')
  }

  const orderData: OrderInsert = {
    paymentId: paymentIntent.id,
    paymentStatus: paymentIntent.status,
    currency: defaultCurrency,
    items,
    total,
    ...buildUserOrderIdentity(user),
  }

  try {
    const validatedOrderData = validate(orderInsertSchema, orderData)
    const createdOrder = await ordersDB.createOrder(validatedOrderData)

    if (!createdOrder) {
      throw new Internal('Failed to create order in database')
    }

    enqueueEmail('adminPaymentNotification', {
      order: createdOrder,
      notificationType: AdminNotification.Created,
    })
  } catch (error) {
    notifyAdminOrderCreationFailed({
      paymentId: paymentIntent.id,
      items,
      total,
      paymentStatus: paymentIntent.status,
    })
    await rollbackFailedOrderCreation(paymentIntent.id)
    throw error
  }

  return {
    paymentId: paymentIntent.id,
    paymentToken: paymentIntent.client_secret,
    amount: amountInCents,
  }
}
