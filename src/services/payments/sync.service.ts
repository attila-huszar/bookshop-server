import { ordersDB } from '@/repositories'
import { paymentIdSchema, validate } from '@/validation'
import {
  extractPaymentIntentFields,
  reportCriticalOrderPersistFailure,
  throwCriticalOrderPersistFailure,
} from '@/utils'
import { log } from '@/libs'
import { enqueueEmail, SendEmailPreconditionError } from '@/queues'
import {
  orderSyncStripeFallbackThresholdMs,
  retryableStatuses,
} from '@/constants'
import { Internal } from '@/errors'
import {
  AdminNotification,
  IssueCode,
  type Order,
  type OrderUpdate,
  type PaymentSyncStatus,
  type StripePaymentIntent,
} from '@/types'
import {
  authorizePaymentAccess,
  type PaymentAccess,
  stripe,
  toOrderPersistSnapshot,
  toPaymentSyncStatus,
} from './shared'

const fallbackDriftPersistFailureMessage =
  '[CRITICAL] Stripe fallback detected status drift but DB update failed'
const fallbackMarkerPersistFailureMessage =
  '[CRITICAL] Stripe fallback sync check timestamp persistence failed'

function isServiceUnavailableError(error: unknown): boolean {
  return (
    error instanceof Internal &&
    error.name === 'ServiceUnavailable' &&
    error.status === 503
  )
}

function shouldFallbackToStripe(order: Order): boolean {
  const fallbackReference = order.lastStripeSyncCheckedAt ?? order.updatedAt
  const orderAgeMs = Date.now() - fallbackReference.getTime()

  return (
    retryableStatuses.includes(order.paymentStatus) &&
    orderAgeMs >= orderSyncStripeFallbackThresholdMs
  )
}

function reportFallbackMarkerPersistFailure(args: {
  paymentId: string
  order: Order
  persistFailureReason: 'threw' | 'returned_null'
  persistError?: unknown
}) {
  reportCriticalOrderPersistFailure({
    issueCode: IssueCode.ORDER_SYNC_MARKER_PERSIST_FAILED,
    message: fallbackMarkerPersistFailureMessage,
    operation: 'update',
    paymentId: args.paymentId,
    persistFailureReason: args.persistFailureReason,
    persistError: args.persistError,
    dbStatus: args.order.paymentStatus,
    notifyAdmin: false,
    order: toOrderPersistSnapshot(args.order),
  })
}

function throwFallbackDriftPersistFailure(args: {
  paymentId: string
  order: Order
  paymentIntent: StripePaymentIntent
  persistFailureReason: 'threw' | 'returned_null'
  persistError?: unknown
}): never {
  throwCriticalOrderPersistFailure({
    issueCode: IssueCode.ORDER_SYNC_DRIFT_PERSIST_FAILED,
    message: fallbackDriftPersistFailureMessage,
    throwMessage:
      'Order status sync is temporarily unavailable. Manual verification is required.',
    errorName: 'ServiceUnavailable',
    statusCode: 503,
    notifyAdmin: false,
    operation: 'update',
    paymentId: args.paymentId,
    persistFailureReason: args.persistFailureReason,
    persistError: args.persistError,
    dbStatus: args.order.paymentStatus,
    stripeStatus: args.paymentIntent.status,
    order: toOrderPersistSnapshot(args.order, {
      paymentStatus: args.paymentIntent.status,
      email: args.paymentIntent.receipt_email ?? args.order.email ?? null,
      shipping: args.paymentIntent.shipping ?? args.order.shipping ?? null,
    }),
  })
}

function enqueueFallbackConfirmationEmails(order: Order): void {
  try {
    enqueueEmail('orderConfirmation', {
      order,
      source: 'fallback',
    })
  } catch (error) {
    if (error instanceof SendEmailPreconditionError) {
      void log.warn(
        '[QUEUE] Skipped order confirmation email due to missing recipient data',
        {
          paymentId: order.paymentId,
          source: 'fallback',
        },
      )
    } else {
      throw error
    }
  }

  enqueueEmail('adminPaymentNotification', {
    order,
    notificationType: AdminNotification.Confirmed,
  })
}

async function persistStripeFallbackSync(args: {
  paymentId: string
  order: Order
  paymentIntent: StripePaymentIntent
  stripeSyncCheckedAt: Date
}): Promise<Order> {
  const { paymentId, paymentIntent, stripeSyncCheckedAt } = args
  const statusChanged = paymentIntent.status !== args.order.paymentStatus
  const justPaid =
    statusChanged && paymentIntent.status === 'succeeded' && !args.order.paidAt
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
    const syncedOrder = await ordersDB.updateOrder(paymentId, updateData)

    if (syncedOrder) {
      if (justPaid) {
        enqueueFallbackConfirmationEmails(syncedOrder)
      }

      return syncedOrder
    }

    if (statusChanged) {
      throwFallbackDriftPersistFailure({
        paymentId,
        order: args.order,
        paymentIntent,
        persistFailureReason: 'returned_null',
      })
    }

    reportFallbackMarkerPersistFailure({
      paymentId,
      order: args.order,
      persistFailureReason: 'returned_null',
    })

    return args.order
  } catch (persistError) {
    if (isServiceUnavailableError(persistError)) {
      throw persistError
    }

    if (statusChanged) {
      throwFallbackDriftPersistFailure({
        paymentId,
        order: args.order,
        paymentIntent,
        persistFailureReason: 'threw',
        persistError,
      })
    }

    reportFallbackMarkerPersistFailure({
      paymentId,
      order: args.order,
      persistFailureReason: 'threw',
      persistError,
    })

    return args.order
  }
}

async function persistStripeSyncMarkerOnly(args: {
  paymentId: string
  order: Order
  stripeSyncCheckedAt: Date
}): Promise<Order> {
  try {
    const syncMarkerOrder = await ordersDB.updateOrder(args.paymentId, {
      lastStripeSyncCheckedAt: args.stripeSyncCheckedAt,
    })

    if (syncMarkerOrder) {
      return syncMarkerOrder
    }

    reportFallbackMarkerPersistFailure({
      paymentId: args.paymentId,
      order: args.order,
      persistFailureReason: 'returned_null',
    })

    return args.order
  } catch (persistError) {
    reportFallbackMarkerPersistFailure({
      paymentId: args.paymentId,
      order: args.order,
      persistFailureReason: 'threw',
      persistError,
    })

    return args.order
  }
}

export async function retrieveOrderSyncStatus(
  paymentId: string,
  access?: PaymentAccess,
): Promise<PaymentSyncStatus> {
  const validatedId = validate(paymentIdSchema, paymentId)
  let order = await authorizePaymentAccess(validatedId, access)

  if (!shouldFallbackToStripe(order)) {
    return toPaymentSyncStatus(order)
  }

  const stripeSyncCheckedAt = new Date()

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(validatedId)

    order = await persistStripeFallbackSync({
      paymentId: validatedId,
      order,
      paymentIntent,
      stripeSyncCheckedAt,
    })
  } catch (error) {
    if (isServiceUnavailableError(error)) {
      throw error
    }

    void log.warn('Stripe fallback sync failed for order status', {
      paymentId: validatedId,
      dbStatus: order.paymentStatus,
      error,
    })

    order = await persistStripeSyncMarkerOnly({
      paymentId: validatedId,
      order,
      stripeSyncCheckedAt,
    })
  }

  return toPaymentSyncStatus(order)
}
