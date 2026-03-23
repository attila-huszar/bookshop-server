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
  extractPaymentIntentFields,
  reportCriticalOrderPersistFailure,
  throwCriticalOrderPersistFailure,
  toIsoString,
} from '@/utils'
import { log } from '@/libs'
import { enqueueEmail, SendEmailPreconditionError } from '@/queues'
import {
  defaultCurrency,
  orderSyncStripeFallbackThresholdMs,
  retryableStatuses,
} from '@/constants'
import { BadRequest, Internal, NotFound, Unauthorized } from '@/errors'
import { AdminNotification, IssueCode } from '@/types'
import type {
  Order,
  OrderInsert,
  OrderItem,
  OrderUpdate,
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
  let order = await authorizePaymentAccess(validatedId, access)

  const fallbackReference = order.lastStripeSyncCheckedAt ?? order.updatedAt
  const orderAgeMs = Date.now() - fallbackReference.getTime()
  const shouldFallbackToStripe =
    retryableStatuses.includes(order.paymentStatus) &&
    orderAgeMs >= orderSyncStripeFallbackThresholdMs

  if (shouldFallbackToStripe) {
    const stripeSyncCheckedAt = new Date()

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(validatedId)
      const statusChanged = paymentIntent.status !== order.paymentStatus
      const justPaid =
        statusChanged && paymentIntent.status === 'succeeded' && !order.paidAt
      const updateData: OrderUpdate = {
        lastStripeSyncCheckedAt: stripeSyncCheckedAt,
        ...(statusChanged
          ? {
              ...extractPaymentIntentFields(paymentIntent),
              paymentStatus: paymentIntent.status,
              ...(justPaid ? { paidAt: new Date() } : {}),
            }
          : {}),
      }

      try {
        const syncedOrder = await ordersDB.updateOrder(validatedId, updateData)

        if (syncedOrder) {
          order = syncedOrder

          if (justPaid) {
            try {
              enqueueEmail('orderConfirmation', {
                order: syncedOrder,
                source: 'fallback',
              })
            } catch (error) {
              if (error instanceof SendEmailPreconditionError) {
                void log.warn(
                  '[QUEUE] Skipped order confirmation email due to missing recipient data',
                  {
                    paymentId: syncedOrder.paymentId,
                    source: 'fallback',
                  },
                )
              } else {
                throw error
              }
            }

            enqueueEmail('adminPaymentNotification', {
              order: syncedOrder,
              notificationType: AdminNotification.Confirmed,
            })
          }
        } else if (statusChanged) {
          throwCriticalOrderPersistFailure({
            issueCode: IssueCode.ORDER_SYNC_DRIFT_PERSIST_FAILED,
            message:
              '[CRITICAL] Stripe fallback detected status drift but DB update failed',
            throwMessage:
              'Order status sync is temporarily unavailable. Manual verification is required.',
            errorName: 'ServiceUnavailable',
            statusCode: 503,
            operation: 'update',
            paymentId: validatedId,
            persistFailureReason: 'returned_null',
            dbStatus: order.paymentStatus,
            stripeStatus: paymentIntent.status,
            order: {
              paymentId: order.paymentId,
              paymentStatus: paymentIntent.status,
              items: order.items,
              total: order.total,
              currency: order.currency,
              firstName: order.firstName,
              lastName: order.lastName,
              email: paymentIntent.receipt_email ?? order.email ?? null,
              shipping: paymentIntent.shipping ?? order.shipping ?? null,
            },
          })
        } else {
          reportCriticalOrderPersistFailure({
            issueCode: IssueCode.ORDER_SYNC_MARKER_PERSIST_FAILED,
            message:
              '[CRITICAL] Stripe fallback sync check timestamp persistence failed',
            operation: 'update',
            paymentId: validatedId,
            persistFailureReason: 'returned_null',
            dbStatus: order.paymentStatus,
            notifyAdmin: false,
            order: {
              paymentId: order.paymentId,
              paymentStatus: order.paymentStatus,
              items: order.items,
              total: order.total,
              currency: order.currency,
              firstName: order.firstName,
              lastName: order.lastName,
              email: order.email,
              shipping: order.shipping,
            },
          })
        }
      } catch (persistError) {
        if (
          persistError instanceof Internal &&
          persistError.name === 'ServiceUnavailable' &&
          persistError.status === 503
        ) {
          throw persistError
        }

        if (statusChanged) {
          throwCriticalOrderPersistFailure({
            issueCode: IssueCode.ORDER_SYNC_DRIFT_PERSIST_FAILED,
            message:
              '[CRITICAL] Stripe fallback detected status drift but DB update failed',
            throwMessage:
              'Order status sync is temporarily unavailable. Manual verification is required.',
            errorName: 'ServiceUnavailable',
            statusCode: 503,
            operation: 'update',
            paymentId: validatedId,
            persistFailureReason: 'threw',
            persistError,
            dbStatus: order.paymentStatus,
            stripeStatus: paymentIntent.status,
            order: {
              paymentId: order.paymentId,
              paymentStatus: paymentIntent.status,
              items: order.items,
              total: order.total,
              currency: order.currency,
              firstName: order.firstName,
              lastName: order.lastName,
              email: paymentIntent.receipt_email ?? order.email ?? null,
              shipping: paymentIntent.shipping ?? order.shipping ?? null,
            },
          })
        } else {
          reportCriticalOrderPersistFailure({
            issueCode: IssueCode.ORDER_SYNC_MARKER_PERSIST_FAILED,
            message:
              '[CRITICAL] Stripe fallback sync check timestamp persistence failed',
            operation: 'update',
            paymentId: validatedId,
            persistFailureReason: 'threw',
            persistError,
            dbStatus: order.paymentStatus,
            notifyAdmin: false,
            order: {
              paymentId: order.paymentId,
              paymentStatus: order.paymentStatus,
              items: order.items,
              total: order.total,
              currency: order.currency,
              firstName: order.firstName,
              lastName: order.lastName,
              email: order.email,
              shipping: order.shipping,
            },
          })
        }
      }
    } catch (error) {
      if (
        error instanceof Internal &&
        error.name === 'ServiceUnavailable' &&
        error.status === 503
      ) {
        throw error
      }

      void log.warn('Stripe fallback sync failed for order status', {
        paymentId: validatedId,
        dbStatus: order.paymentStatus,
        error,
      })

      try {
        const syncMarkerOrder = await ordersDB.updateOrder(validatedId, {
          lastStripeSyncCheckedAt: stripeSyncCheckedAt,
        })

        if (syncMarkerOrder) {
          order = syncMarkerOrder
        } else {
          reportCriticalOrderPersistFailure({
            issueCode: IssueCode.ORDER_SYNC_MARKER_PERSIST_FAILED,
            message:
              '[CRITICAL] Stripe fallback sync check timestamp persistence failed',
            operation: 'update',
            paymentId: validatedId,
            persistFailureReason: 'returned_null',
            dbStatus: order.paymentStatus,
            notifyAdmin: false,
            order: {
              paymentId: order.paymentId,
              paymentStatus: order.paymentStatus,
              items: order.items,
              total: order.total,
              currency: order.currency,
              firstName: order.firstName,
              lastName: order.lastName,
              email: order.email,
              shipping: order.shipping,
            },
          })
        }
      } catch (persistError) {
        reportCriticalOrderPersistFailure({
          issueCode: IssueCode.ORDER_SYNC_MARKER_PERSIST_FAILED,
          message:
            '[CRITICAL] Stripe fallback sync check timestamp persistence failed',
          operation: 'update',
          paymentId: validatedId,
          persistFailureReason: 'threw',
          persistError,
          dbStatus: order.paymentStatus,
          notifyAdmin: false,
          order: {
            paymentId: order.paymentId,
            paymentStatus: order.paymentStatus,
            items: order.items,
            total: order.total,
            currency: order.currency,
            firstName: order.firstName,
            lastName: order.lastName,
            email: order.email,
            shipping: order.shipping,
          },
        })
      }
    }
  }

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
      imgUrl: book.imgUrl ?? '',
      price: book.price,
      discount: book.discount ?? 0,
      quantity: item.quantity,
    })
  }

  total = Number(total.toFixed(2))

  if (Math.abs(total - validatedRequest.expectedTotal) > 0.05) {
    throw new BadRequest(
      'Prices have been updated in your cart. Please review before checkout.',
      'PriceConflict',
      409,
    )
  }

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
      enqueueEmail('adminPaymentNotification', {
        notificationType: AdminNotification.Error,
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

  try {
    await ordersDB.updateOrder(validatedId, {
      paymentStatus: 'canceled',
    })
  } catch (error) {
    throwCriticalOrderPersistFailure({
      issueCode: IssueCode.PAYMENT_CANCEL_PERSIST_FAILED,
      message:
        '[CRITICAL] Stripe payment canceled but order status update failed',
      throwMessage: 'Failed to persist canceled payment status',
      operation: 'update',
      paymentId: validatedId,
      persistFailureReason: 'threw',
      persistError: error,
      dbStatus: order.paymentStatus,
      stripeStatus: 'canceled',
      order: {
        paymentId: order.paymentId,
        paymentStatus: order.paymentStatus,
        items: order.items,
        total: order.total,
        currency: order.currency,
        firstName: order.firstName,
        lastName: order.lastName,
        email: order.email,
        shipping: order.shipping,
      },
    })
  }

  return cancelledIntent
}
