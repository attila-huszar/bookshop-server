import { env } from '@/config'
import { booksDB, ordersDB, termsDB } from '@/repositories'
import {
  acceptPaymentTermsSchema,
  orderInsertSchema,
  paymentIdSchema,
  paymentIntentRequestSchema,
  validate,
} from '@/validation'
import { orderResponse } from '@/utils/response.utils'
import { log, stripe } from '@/libs'
import { defaultCurrency, paymentMessage } from '@/constants'
import { BadRequest, Internal, NotFound } from '@/errors'
import { Unauthorized } from '@/errors/Unauthorized'
import type {
  CheckoutTerms,
  Order,
  OrderInsert,
  OrderItem,
  PaymentAccess,
  PaymentIntentRequest,
  PaymentSession,
  PublicUser,
  StripePaymentIntent,
  TermsAcceptance,
} from '@/types'
import { PaymentErrorCode, TermsErrorCode } from '@/types/enums'

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
    throw new Unauthorized(
      'Unauthorized payment access',
      PaymentErrorCode.AccessDenied,
    )
  }

  const accessEmail = access.userEmail?.toLowerCase()
  const hasSessionAccess = access.cookiePaymentId === validatedId
  const hasEmailAccess =
    Boolean(accessEmail) && order.email?.toLowerCase() === accessEmail

  if (!hasSessionAccess && !hasEmailAccess) {
    throw new Unauthorized(
      'Unauthorized payment access',
      PaymentErrorCode.AccessDenied,
    )
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

export async function getPaymentTerms(
  paymentId: string,
  access: PaymentAccess,
) {
  const { order } = await resolveAuthorizedPayment(paymentId, access)
  const document = await termsDB.getCurrentTerms()
  const terms: CheckoutTerms | null = document
    ? {
        url: `${env.clientBaseUrl!.replace(/\/$/, '')}/terms/${document.version}`,
        version: document.version,
        statements: document.statements,
        publishedAt: document.publishedAt,
      }
    : null

  return {
    terms,
    order: {
      items: orderResponse(order).items,
      total: order.total,
      currency: order.currency,
    },
  }
}

export async function acceptPaymentTerms(
  paymentId: string,
  input: unknown,
  access: PaymentAccess,
): Promise<TermsAcceptance> {
  const request = acceptPaymentTermsSchema.parse(input)
  const { validatedId, order } = await resolveAuthorizedPayment(
    paymentId,
    access,
  )
  const terms = await termsDB.getCurrentTerms()

  if (!terms) {
    throw new BadRequest(
      'Terms and conditions are currently unavailable. Please try again later.',
      TermsErrorCode.Unavailable,
      503,
    )
  }

  if (request.version !== terms.version) {
    throw new BadRequest(
      'The terms and conditions have changed. Please review and accept them again.',
      TermsErrorCode.Changed,
      412,
    )
  }

  if (order.deletedAt || order.paymentStatus === 'canceled') {
    throw new BadRequest(
      'This checkout has ended. Please start a new checkout.',
      PaymentErrorCode.CheckoutEnded,
      410,
    )
  }

  const recordedOrder = order.termsAcceptance
    ? order
    : await ordersDB.recordTermsAcceptance(validatedId, {
        version: terms.version,
        language: request.language,
        statement: terms.statements[request.language],
        acceptedAt: new Date().toISOString(),
      })
  const acceptance = recordedOrder?.termsAcceptance

  if (!acceptance) {
    throw new BadRequest(
      'Unable to record terms acceptance for this checkout. Please start a new checkout.',
      TermsErrorCode.NotRecorded,
      409,
    )
  }

  if (acceptance.version !== terms.version) {
    throw new BadRequest(
      'This checkout accepted an earlier version of the terms. Please start a new checkout.',
      TermsErrorCode.AlreadyAccepted,
      412,
    )
  }

  return acceptance
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

  if (existingOrder) {
    return existingOrder
  }

  const { items, total } = await buildOrderItemsAndTotal(validatedRequest)

  if (Math.abs(total - validatedRequest.expectedTotal) > 0.05) {
    throw new BadRequest(
      paymentMessage.priceUpdatedInCart,
      PaymentErrorCode.PriceConflict,
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
            metadata: {
              orderId: String(order.id),
              checkoutRequestId: order.checkoutRequestId,
            },
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
      PaymentErrorCode.CheckoutEnded,
      410,
    )
  }

  if (!paymentIntent.client_secret) {
    throw new Internal('Failed to create payment intent: missing client secret')
  }

  const linkedOrder = await ordersDB.linkPaymentIntent(
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
    throw new BadRequest(
      paymentMessage.paymentAlreadyCanceled,
      PaymentErrorCode.AlreadyCanceled,
    )
  }

  if (order.paymentStatus === 'succeeded') {
    throw new BadRequest(
      paymentMessage.paymentCannotCancelSucceeded,
      PaymentErrorCode.AlreadySucceeded,
    )
  }

  return await stripe.paymentIntents.cancel(validatedId)
}
