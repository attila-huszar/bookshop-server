import { ordersDB } from '@/repositories'
import { extractPaymentIntentFields } from '@/utils'
import { log, stripe } from '@/libs'
import { enqueueEmail } from '@/queues'
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
  type PaymentAccess,
  reportCriticalOrderPersistFailure,
  resolveAuthorizedPayment,
  throwCriticalOrderPersistFailure,
  toOrderPersistSnapshot,
  toPaymentSyncStatus,
} from '../shared'

const fallbackDriftPersistFailureMessage =
  '[CRITICAL] Stripe fallback detected status drift but DB update failed'
const fallbackMarkerPersistFailureMessage =
  '[CRITICAL] Stripe fallback sync check timestamp persistence failed'
type PersistFailureReason = 'threw' | 'returned_null'
type PersistFailureHandler = (
  persistFailureReason: PersistFailureReason,
  persistError?: unknown,
) => never | void

function isServiceUnavailableError(error: unknown): boolean {
  return error instanceof Internal && error.status === 503
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
  persistFailureReason: PersistFailureReason
  persistError?: unknown
}): void {
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
  persistFailureReason: PersistFailureReason
  persistError?: unknown
}): never {
  throwCriticalOrderPersistFailure({
    issueCode: IssueCode.ORDER_SYNC_DRIFT_PERSIST_FAILED,
    message: fallbackDriftPersistFailureMessage,
    throwMessage:
      'Order status sync is temporarily unavailable. Manual verification is required.',
    errorName: 'ServiceUnavailable',
    statusCode: 503,
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

function sendFallbackPaidNotifications(order: Order): void {
  enqueueEmail('orderConfirmation', {
    order,
  })

  enqueueEmail('adminPaymentNotification', {
    order,
    notificationType: AdminNotification.Confirmed,
  })
}

async function persistOrderSyncUpdate(args: {
  paymentId: string
  order: Order
  updateData: OrderUpdate
  onPersistFailure: PersistFailureHandler
  onPersisted?: (syncedOrder: Order) => void
}): Promise<Order> {
  try {
    const syncedOrder = await ordersDB.updateOrder(
      args.paymentId,
      args.updateData,
    )

    if (!syncedOrder) {
      args.onPersistFailure('returned_null')
      return args.order
    }

    args.onPersisted?.(syncedOrder)
    return syncedOrder
  } catch (persistError) {
    if (isServiceUnavailableError(persistError)) {
      throw persistError
    }

    args.onPersistFailure('threw', persistError)
    return args.order
  }
}

async function persistStripeFallbackSync(args: {
  paymentId: string
  order: Order
  paymentIntent: StripePaymentIntent
  stripeSyncCheckedAt: Date
}): Promise<Order> {
  const { paymentId, order, paymentIntent, stripeSyncCheckedAt } = args
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

  return await persistOrderSyncUpdate({
    paymentId,
    order,
    updateData,
    onPersistFailure: (persistFailureReason, persistError) => {
      if (statusChanged) {
        throwFallbackDriftPersistFailure({
          paymentId,
          order,
          paymentIntent,
          persistFailureReason,
          persistError,
        })
      }

      reportFallbackMarkerPersistFailure({
        paymentId,
        order,
        persistFailureReason,
        persistError,
      })
    },
    onPersisted: justPaid ? sendFallbackPaidNotifications : undefined,
  })
}

export async function retrieveOrderSyncStatus(
  paymentId: string,
  access?: PaymentAccess,
): Promise<PaymentSyncStatus> {
  const { validatedId, order: authorizedOrder } =
    await resolveAuthorizedPayment({
      paymentId,
      access,
    })
  let order = authorizedOrder

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

    order = await persistOrderSyncUpdate({
      paymentId: validatedId,
      order,
      updateData: {
        lastStripeSyncCheckedAt: stripeSyncCheckedAt,
      },
      onPersistFailure: (persistFailureReason, persistError) => {
        reportFallbackMarkerPersistFailure({
          paymentId: validatedId,
          order,
          persistFailureReason,
          persistError,
        })
      },
    })
  }

  return toPaymentSyncStatus(order)
}
