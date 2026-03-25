import { ordersDB } from '@/repositories'
import { extractPaymentIntentFields, toIsoString } from '@/utils'
import { log, stripe } from '@/libs'
import { enqueueEmail } from '@/queues'
import {
  orderSyncStripeFallbackThresholdMs,
  retryableStatuses,
} from '@/constants'
import { ServiceUnavailable } from '@/errors'
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
  reportOrderSaveError,
  resolveAuthorizedPayment,
} from '../shared'

type SaveFailureReason = 'threw' | 'returned_null'
type SaveFailureHandler = (
  saveFailureReason: SaveFailureReason,
  saveError?: unknown,
) => never | void

function shouldFallbackToStripe(order: Order): boolean {
  const fallbackReference = order.lastStripeSyncCheckedAt ?? order.updatedAt
  const orderAgeMs = Date.now() - fallbackReference.getTime()

  return (
    retryableStatuses.includes(order.paymentStatus) &&
    orderAgeMs >= orderSyncStripeFallbackThresholdMs
  )
}

function reportFallbackMarkerSaveFailure(args: {
  paymentId: string
  order: Order
  saveFailureReason: SaveFailureReason
  saveError?: unknown
}): void {
  void log.error(
    '[CRITICAL] Stripe fallback sync check timestamp save failed',
    {
      issueCode: IssueCode.ORDER_SYNC_MARKER_SAVE_FAILED,
      entity: 'order',
      operation: 'update',
      paymentId: args.paymentId,
      saveFailureReason: args.saveFailureReason,
      dbStatus: args.order.paymentStatus,
      error: args.saveError,
    },
  )
}

async function saveOrderSyncUpdate(args: {
  paymentId: string
  order: Order
  updateData: OrderUpdate
  onSaveFailure: SaveFailureHandler
  onSaved?: (savedOrder: Order, saveResult: { becamePaid: boolean }) => void
}): Promise<Order> {
  try {
    const { order: savedOrder, becamePaid } =
      await ordersDB.updateOrderWithPaidTransition(
        args.paymentId,
        args.updateData,
      )

    if (!savedOrder) {
      args.onSaveFailure('returned_null')
      return args.order
    }

    args.onSaved?.(savedOrder, { becamePaid })
    return savedOrder
  } catch (saveError) {
    if (saveError instanceof ServiceUnavailable) {
      throw saveError
    }

    args.onSaveFailure('threw', saveError)
    return args.order
  }
}

async function saveStripeFallbackSync(args: {
  paymentId: string
  order: Order
  paymentIntent: StripePaymentIntent
  stripeSyncCheckedAt: Date
}): Promise<Order> {
  const { paymentId, order, paymentIntent, stripeSyncCheckedAt } = args
  const statusChanged = paymentIntent.status !== order.paymentStatus
  const updateData: OrderUpdate = {
    lastStripeSyncCheckedAt: stripeSyncCheckedAt,
    ...(statusChanged
      ? {
          ...extractPaymentIntentFields(paymentIntent),
          paymentStatus: paymentIntent.status,
          ...(paymentIntent.status === 'succeeded'
            ? { paidAt: new Date() }
            : {}),
        }
      : {}),
  }

  return await saveOrderSyncUpdate({
    paymentId,
    order,
    updateData,
    onSaveFailure: (saveFailureReason, saveError) => {
      if (statusChanged) {
        reportOrderSaveError({
          issueCode: IssueCode.ORDER_SYNC_DRIFT_SAVE_FAILED,
          message:
            '[CRITICAL] Stripe fallback detected status drift but DB save failed',
          operation: 'update',
          paymentId,
          saveFailureReason,
          saveError,
          dbStatus: order.paymentStatus,
          stripeStatus: paymentIntent.status,
          order: {
            ...order,
            paymentStatus: paymentIntent.status,
            email: paymentIntent.receipt_email ?? order.email ?? null,
            shipping: paymentIntent.shipping ?? order.shipping ?? null,
          },
        })
        throw new ServiceUnavailable(
          'Order status sync is temporarily unavailable. Manual verification is required.',
        )
      }

      reportFallbackMarkerSaveFailure({
        paymentId,
        order,
        saveFailureReason,
        saveError,
      })
    },
    onSaved: (savedOrder: Order, saveResult: { becamePaid: boolean }) => {
      if (!saveResult.becamePaid) {
        return
      }

      enqueueEmail('orderConfirmation', {
        order: savedOrder,
      })
      enqueueEmail('adminPaymentNotification', {
        order: savedOrder,
        notificationType: AdminNotification.Confirmed,
      })
    },
  })
}

export async function retrieveOrderSyncStatus(
  paymentId: string,
  access: PaymentAccess,
): Promise<PaymentSyncStatus> {
  const { validatedId, order: authorizedOrder } =
    await resolveAuthorizedPayment(paymentId, access)
  let order = authorizedOrder

  if (shouldFallbackToStripe(order)) {
    const stripeSyncCheckedAt = new Date()

    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(validatedId)

      order = await saveStripeFallbackSync({
        paymentId: validatedId,
        order,
        paymentIntent,
        stripeSyncCheckedAt,
      })
    } catch (error) {
      if (error instanceof ServiceUnavailable) {
        throw error
      }

      void log.warn('Stripe fallback sync failed for order status', {
        paymentId: validatedId,
        dbStatus: order.paymentStatus,
        error,
      })

      order = await saveOrderSyncUpdate({
        paymentId: validatedId,
        order,
        updateData: {
          lastStripeSyncCheckedAt: stripeSyncCheckedAt,
        },
        onSaveFailure: (saveFailureReason, saveError) => {
          reportFallbackMarkerSaveFailure({
            paymentId: validatedId,
            order,
            saveFailureReason,
            saveError,
          })
        },
      })
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
