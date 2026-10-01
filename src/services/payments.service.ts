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
  const hasSessionAccess = access.cookiePaymentId === validatedId
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

export async function retrievePaymentIntent(
  paymentId: string,
  access: PaymentAccess,
) {
  const { validatedId } = await resolveAuthorizedPayment(paymentId, access)
  return await stripe.paymentIntents.retrieve(validatedId)
}

async function getOrCreateCheckoutOrder(
  paymentIntentRequest: PaymentIntentRequest,
  user: PublicUser | null,
  checkoutRequestId: string,
): Promise<Order> {
  const validatedRequest = validate(
    paymentIntentRequestSchema,
    paymentIntentRequest,
  )
  const existingOrder =
    await ordersDB.getOrderByCheckoutRequestId(checkoutRequestId)
  if (existingOrder) return existingOrder

  const { items, total } = await buildOrderItemsAndTotal(validatedRequest)

  if (Math.abs(total - validatedRequest.expectedTotal) > 0.05) {
    throw new BadRequest(
      paymentMessage.priceUpdatedInCart,
      'PriceConflict',
      409,
    )
  }

  const orderData: OrderInsert = {
    checkoutRequestId,
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
  const draftOrder = await ordersDB.createCheckoutOrder(validatedOrderData)

  if (draftOrder?.id === undefined) {
    throw new Internal('Failed to create order in database')
  }

  return draftOrder
}

export async function startCheckoutPayment(
  paymentIntentRequest: PaymentIntentRequest,
  user: PublicUser | null,
  checkoutRequestId: string,
): Promise<PaymentSession> {
  const order = await getOrCreateCheckoutOrder(
    paymentIntentRequest,
    user,
    checkoutRequestId,
  )

  let paymentIntent: StripePaymentIntent
  try {
    // Use the persisted snapshot on retries, not current prices or user details.
    paymentIntent = order.paymentId
      ? await stripe.paymentIntents.retrieve(order.paymentId)
      : await stripe.paymentIntents.create(
          {
            amount: Math.round(order.total * 100),
            currency: order.currency.toLowerCase(),
            metadata: { orderId: String(order.id) },
          },
          { idempotencyKey: checkoutRequestId },
        )
  } catch (error) {
    // A timeout does not prove Stripe failed. Keep the order for retries and
    // webhooks, which may already have linked the intent while we were waiting.
    void log.error('Failed to resolve Stripe payment for checkout order', {
      orderId: order.id,
      checkoutRequestId,
      error,
    })
    throw error
  }

  if (paymentIntent.status === 'canceled') {
    throw new BadRequest(
      'This checkout was canceled. Please start a new checkout.',
      'CheckoutCanceled',
      410,
    )
  }

  if (!paymentIntent.client_secret) {
    throw new Internal('Failed to create payment intent: missing client secret')
  }

  const { order: linkedOrder, linked } = await ordersDB.linkPaymentIntent(
    order.id,
    paymentIntent.id,
    paymentIntent.status,
  )

  if (!linkedOrder) {
    void log.error('Failed to link payment intent to draft order', {
      orderId: order.id,
      paymentId: paymentIntent.id,
      checkoutRequestId,
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
    amount: paymentIntent.amount,
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
