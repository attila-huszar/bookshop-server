import { booksDB, ordersDB } from '@/repositories'
import {
  orderInsertSchema,
  paymentIdSchema,
  paymentIntentRequestSchema,
  validate,
} from '@/validation'
import { log, stripe } from '@/libs'
import { enqueueEmail } from '@/queues'
import { defaultCurrency, paymentMessage } from '@/constants'
import { BadRequest, Internal, NotFound } from '@/errors'
import { Unauthorized } from '@/errors/Unauthorized'
import { AdminNotification } from '@/types'
import type {
  Order,
  OrderInsert,
  OrderItem,
  PaymentAccess,
  PaymentIntentRequest,
  PaymentSession,
  PublicUser,
  StripePaymentIntent,
} from '@/types'

async function resolveAuthorizedPayment(
  paymentId: string,
  access: PaymentAccess,
): Promise<{ validatedId: string; order: Order }> {
  const validatedId = validate(paymentIdSchema, paymentId)

  let order: Order | null
  try {
    order = await ordersDB.getOrder(validatedId)
  } catch (lookupErr) {
    void log.error('ordersDB.getOrder failed in resolveAuthorizedPayment', {
      paymentId: validatedId,
      lookupErr,
    })
    throw new Internal('Failed to read order')
  }

  if (!order) {
    throw new Unauthorized('Unauthorized payment access')
  }

  const accessEmail = access.userEmail?.toLowerCase()
  const hasSessionAccess = access.paymentSessionId === validatedId
  const hasEmailAccess =
    Boolean(accessEmail) && order.email?.toLowerCase() === accessEmail

  if (!hasSessionAccess && !hasEmailAccess) {
    throw new Unauthorized('Unauthorized payment access')
  }

  return { validatedId, order }
}

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

async function createPaymentIntent({
  amountInCents,
  orderId,
  requestId,
  user,
}: {
  amountInCents: number
  orderId: number
  requestId: string
  user: PublicUser | null
}): Promise<StripePaymentIntent> {
  const createParams = {
    amount: amountInCents,
    currency: defaultCurrency.toLowerCase(),
    metadata: {
      orderId: String(orderId),
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

export async function startCheckoutPayment(
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
  const orderData: OrderInsert = {
    paymentId: null,
    paymentStatus: 'processing',
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

  const validatedOrderData = validate(orderInsertSchema, orderData)
  const draftOrder = await ordersDB.createOrder(validatedOrderData)

  if (draftOrder?.id === undefined) {
    throw new Internal('Failed to create order in database')
  }

  let paymentIntent: StripePaymentIntent
  try {
    paymentIntent = await createPaymentIntent({
      amountInCents,
      orderId: draftOrder.id,
      requestId,
      user,
    })
  } catch (error) {
    void log.error('Stripe payment intent creation failed for draft order', {
      orderId: draftOrder.id,
      requestId,
      error,
    })
    await ordersDB
      .deleteOrderById(draftOrder.id)
      .catch((cleanupError: unknown) => {
        void log.error(
          'Failed to remove draft order after Stripe creation failed',
          {
            orderId: draftOrder.id,
            requestId,
            error: cleanupError,
          },
        )
      })
    throw error
  }

  if (!paymentIntent.client_secret) {
    throw new Internal('Failed to create payment intent: missing client secret')
  }

  const metadataOrderId = Number(paymentIntent.metadata?.orderId)
  const linkedOrderId =
    Number.isSafeInteger(metadataOrderId) && metadataOrderId > 0
      ? metadataOrderId
      : draftOrder.id
  const targetOrder = await ordersDB.getOrderById(linkedOrderId)

  if (!targetOrder) {
    throw new Internal('Failed to find order for payment intent')
  }

  if (targetOrder.id !== draftOrder.id) {
    await ordersDB.deleteOrderById(draftOrder.id)
  }

  const { order: linkedOrder, linked } = await ordersDB.linkPaymentIntent(
    targetOrder.id,
    paymentIntent.id,
    paymentIntent.status,
  )

  if (!linkedOrder) {
    void log.error('Failed to link payment intent to draft order', {
      orderId: targetOrder.id,
      paymentId: paymentIntent.id,
      requestId,
    })
    throw new Internal('Failed to link payment intent to order')
  }

  if (linked) {
    enqueueEmail('adminPaymentNotification', {
      order: linkedOrder,
      notificationType: AdminNotification.Created,
    })
  }

  return {
    paymentId: paymentIntent.id,
    paymentToken: paymentIntent.client_secret,
    amount: amountInCents,
  }
}

export async function cancelPaymentIntent(
  paymentId: string,
  access: PaymentAccess,
): Promise<StripePaymentIntent> {
  const { validatedId, order } = await resolveAuthorizedPayment(
    paymentId,
    access,
  )

  if (order.paymentStatus === 'canceled') {
    throw new BadRequest(paymentMessage.paymentAlreadyCanceled)
  }

  if (order.paymentStatus === 'succeeded') {
    throw new BadRequest(paymentMessage.paymentCannotCancelSucceeded)
  }

  return await stripe.paymentIntents.cancel(validatedId)
}
