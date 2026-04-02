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
import { type PaymentAccess, resolveAuthorizedPayment } from '../shared'

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

async function createStripePaymentIntentWithRecovery({
  amountInCents,
  requestId,
  user,
}: {
  amountInCents: number
  requestId: string
  user: PublicUser | null
}): Promise<StripePaymentIntent> {
  const createParams = {
    amount: amountInCents,
    currency: defaultCurrency.toLowerCase(),
    metadata: {
      requestId,
      ...(user && {
        userEmail: user.email,
        userName: `${user.firstName} ${user.lastName}`.trim(),
      }),
    },
  } as const

  const paymentIntent = await stripe.paymentIntents.create(createParams, {
    idempotencyKey: requestId,
  })

  if (paymentIntent.status !== 'canceled') {
    return paymentIntent
  }

  const recoveryIdempotencyKey = `${requestId}:recovery`
  void log.warn(
    'Received canceled idempotent payment intent replay, creating fresh Stripe intent',
    {
      requestId,
      paymentId: paymentIntent.id,
    },
  )

  const recoveredPaymentIntent = await stripe.paymentIntents.create(
    createParams,
    {
      idempotencyKey: recoveryIdempotencyKey,
    },
  )

  if (recoveredPaymentIntent.status === 'canceled') {
    throw new Internal('Failed to create a usable payment intent')
  }

  return recoveredPaymentIntent
}

export async function retrievePaymentIntent(
  paymentId: string,
  access: PaymentAccess,
) {
  const { validatedId } = await resolveAuthorizedPayment(paymentId, access)
  return await stripe.paymentIntents.retrieve(validatedId)
}

export async function createPaymentIntent(
  paymentIntentRequest: PaymentIntentRequest,
  user: PublicUser | null,
  requestId: string,
): Promise<PaymentSession> {
  const validatedRequest = validate(
    paymentIntentRequestSchema,
    paymentIntentRequest,
  )
  const { items, total } = await buildOrderItemsAndTotal(validatedRequest)

  if (Math.abs(total - validatedRequest.expectedTotal) > 0.05) {
    throw new BadRequest(
      paymentMessage.priceUpdatedInCart,
      'PriceConflict',
      409,
    )
  }

  const amountInCents = Math.round(total * 100)
  const paymentIntent = await createStripePaymentIntentWithRecovery({
    amountInCents,
    requestId,
    user,
  })

  if (!paymentIntent?.client_secret) {
    throw new Internal('Failed to create payment intent: missing client secret')
  }

  const existingOrder = await ordersDB.getOrder(paymentIntent.id)

  if (existingOrder) {
    return {
      paymentId: paymentIntent.id,
      paymentToken: paymentIntent.client_secret,
      amount: amountInCents,
    }
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
    const existingOrderAfterFailure = await ordersDB.getOrder(paymentIntent.id)

    if (existingOrderAfterFailure) {
      void log.warn(
        'Recovered idempotent payment intent after order create conflict',
        {
          paymentId: paymentIntent.id,
          requestId,
        },
      )

      return {
        paymentId: paymentIntent.id,
        paymentToken: paymentIntent.client_secret,
        amount: amountInCents,
      }
    }

    enqueueEmail('adminPaymentNotification', {
      notificationType: AdminNotification.Error,
      order: {
        paymentId: paymentIntent.id,
        items,
        total,
        currency: defaultCurrency,
        paymentStatus: paymentIntent.status,
      },
    })

    try {
      await stripe.paymentIntents.cancel(paymentIntent.id)
      void log.warn(
        'Rolled back Stripe payment intent after order creation failed',
        {
          paymentId: paymentIntent.id,
        },
      )
    } catch (rollbackError) {
      void log.error('Failed to rollback Stripe payment intent', {
        paymentId: paymentIntent.id,
        rollbackError,
      })
    }

    throw error
  }

  return {
    paymentId: paymentIntent.id,
    paymentToken: paymentIntent.client_secret,
    amount: amountInCents,
  }
}
