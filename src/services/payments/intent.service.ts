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
import { AdminNotification, IssueCode } from '@/types'
import type {
  OrderInsert,
  OrderItem,
  PaymentIntentRequest,
  PaymentSession,
  PublicUser,
  StripePaymentIntent,
} from '@/types'
import {
  type PaymentAccess,
  reportOrderError,
  resolveAuthorizedPayment,
} from '../shared'

async function buildOrderItemsAndTotal(
  paymentIntentRequest: PaymentIntentRequest,
): Promise<{ items: OrderItem[]; total: number }> {
  const pricedItems = await Promise.all(
    paymentIntentRequest.items.map(async (item) => {
      const book = await booksDB.getBookById(item.id)

      if (!book) {
        throw new NotFound(
          `Book not found during payment intent creation: ID ${item.id}`,
        )
      }

      const priceCents = Math.round(book.price * 100)
      const itemTotalCents = Math.round(
        item.quantity * priceCents * (1 - (book.discount ?? 0) / 100),
      )
      const orderItem: OrderItem = {
        id: book.id,
        title: book.title,
        author: book.author,
        imgUrl: book.imgUrl ?? '',
        price: book.price,
        discount: book.discount ?? 0,
        quantity: item.quantity,
      }

      return {
        itemTotalCents,
        item: orderItem,
      }
    }),
  )

  const totalCents = pricedItems.reduce(
    (sum, pricedItem) => sum + pricedItem.itemTotalCents,
    0,
  )
  const items = pricedItems.map((pricedItem) => pricedItem.item)

  return {
    items,
    total: totalCents / 100,
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
    ...(user && {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      shipping: {
        name: `${user.firstName} ${user.lastName}`,
        address: user.address ?? undefined,
        phone: user.phone ?? undefined,
      },
    }),
  }

  let saveFailureReason: 'threw' | 'returned_null' = 'threw'

  try {
    const validatedOrderData = validate(orderInsertSchema, orderData)
    const createdOrder = await ordersDB.createOrder(validatedOrderData)

    if (!createdOrder) {
      saveFailureReason = 'returned_null'
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

    reportOrderError({
      issueCode: IssueCode.ORDER_CREATE_SAVE_FAILED,
      message: '[CRITICAL] Order create after payment intent save failed',
      operation: 'create',
      paymentId: paymentIntent.id,
      saveFailureReason,
      saveError: error,
      stripeStatus: paymentIntent.status,
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
