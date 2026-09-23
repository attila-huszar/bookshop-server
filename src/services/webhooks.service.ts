import { env } from '@/config'
import { ordersDB } from '@/repositories'
import { extractPaymentIntentFields, getPaymentIntentId } from '@/utils'
import { log, stripe } from '@/libs'
import { cancelAdminPaymentErrorAlert, enqueueEmail } from '@/queues'
import { terminalStatuses } from '@/constants'
import { BadRequest } from '@/errors/BadRequest'
import { Internal } from '@/errors/Internal'
import {
  AdminNotification,
  type AdminPaymentNotificationOrder,
  isChargeEvent,
  isDisputeEvent,
  isPaymentIntentEvent,
  isRefundEvent,
  IssueCode,
  type Order,
  type OrderUpdate,
  type PaymentIntentStatus,
  type StripeEvent,
  type StripePaymentIntent,
} from '@/types'

type SaveOperation = 'create' | 'update'
type SaveFailureReason = 'threw' | 'returned_null'

type ReportOrderErrorParams = {
  issueCode: IssueCode
  operation: SaveOperation
  paymentId: string
  order: AdminPaymentNotificationOrder
  saveFailureReason: SaveFailureReason
  saveError?: unknown
  dbStatus?: PaymentIntentStatus
  stripeStatus?: PaymentIntentStatus
  message?: string
  notifyAdmin?: boolean
  additionalContext?: Record<string, unknown>
}

type WebhookEventMeta = {
  eventType: string
  eventId: string
  eventCreated: number
}

const paymentStatusRank: Partial<Record<PaymentIntentStatus, number>> = {
  requires_payment_method: 10,
  requires_confirmation: 20,
  requires_action: 30,
  processing: 40,
  requires_capture: 50,
  succeeded: 100,
  canceled: 100,
}

const getPaymentStatusRank = (status?: PaymentIntentStatus): number | null => {
  if (!status) return null
  const rank = paymentStatusRank[status]

  if (rank === undefined) {
    void log.warn('[STRIPE] Unmapped payment status rank', { status })
    return null
  }
  return rank
}

const isCriticalMissingOrderEventType = (eventType: string): boolean =>
  eventType === 'payment_intent.succeeded' ||
  eventType === 'payment_intent.canceled'

function notifyOrderConfirmed(order: Order): void {
  enqueueEmail('orderConfirmation', { order })
  enqueueEmail('adminPaymentNotification', {
    order,
    notificationType: AdminNotification.Confirmed,
  })
}

function reportOrderError({
  issueCode,
  operation,
  paymentId,
  order,
  saveFailureReason,
  saveError,
  dbStatus,
  stripeStatus,
  message = '[CRITICAL] Order save failed',
  notifyAdmin = true,
  additionalContext,
}: ReportOrderErrorParams): void {
  void log.error(message, {
    issueCode,
    entity: 'order',
    operation,
    paymentId,
    saveFailureReason,
    dbStatus,
    stripeStatus,
    error: saveError,
    ...additionalContext,
  })

  if (notifyAdmin) {
    enqueueEmail('adminPaymentNotification', {
      notificationType: AdminNotification.Error,
      order,
      source: issueCode,
    })
  }
}

function reportMissingOrderForPaymentIntentWebhook({
  paymentIntent,
  paymentStatus,
  eventMeta,
}: {
  paymentIntent: StripePaymentIntent
  paymentStatus: PaymentIntentStatus
  eventMeta: WebhookEventMeta
}) {
  const { eventType, eventId, eventCreated } = eventMeta
  const extractedFields = extractPaymentIntentFields(paymentIntent)

  void log.error('[CRITICAL] Missing order for Stripe payment_intent webhook', {
    issueCode: IssueCode.WEBHOOK_MISSING_ORDER,
    paymentId: paymentIntent.id,
    eventType,
    eventId,
    eventCreated,
    stripeStatus: paymentStatus,
    amount: paymentIntent.amount,
    currency: paymentIntent.currency,
    receiptEmail: paymentIntent.receipt_email ?? null,
  })

  enqueueEmail('adminPaymentNotification', {
    notificationType: AdminNotification.Error,
    source: IssueCode.WEBHOOK_MISSING_ORDER,
    order: {
      paymentId: paymentIntent.id,
      items: [],
      total: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      paymentStatus,
      ...extractedFields,
    },
  })
}

async function resolveOrderForWebhook(paymentIntent: StripePaymentIntent) {
  const existingOrder = await ordersDB.getOrder(paymentIntent.id)

  if (existingOrder) return existingOrder

  const orderId = Number(paymentIntent.metadata?.orderId)
  if (!Number.isSafeInteger(orderId) || orderId <= 0) return null

  const { order, linked } = await ordersDB.linkPaymentIntent(
    orderId,
    paymentIntent.id,
    paymentIntent.status,
  )

  if (order && linked) {
    enqueueEmail('adminPaymentNotification', {
      order,
      notificationType: AdminNotification.Created,
    })
  }

  return order
}

export async function processStripeWebhook(
  payload: string,
  signature: string,
): Promise<{ received: boolean }> {
  if (!env.stripeWebhookSecret) {
    throw new Internal('Stripe webhook secret not configured')
  }

  let event: StripeEvent

  try {
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      env.stripeWebhookSecret,
    )
  } catch (err) {
    throw new BadRequest(
      `Webhook signature verification failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    )
  }

  const eventId = event.id
  const eventCreated = event.created

  if (isPaymentIntentEvent(event)) {
    const { data, type } = event
    const paymentIntent = data.object
    const eventMeta: WebhookEventMeta = {
      eventType: type,
      eventId,
      eventCreated,
    }
    const updateOrder = (data: OrderUpdate) =>
      updateOrderFromWebhook(paymentIntent, data, eventMeta)

    switch (type) {
      case 'payment_intent.created': {
        await updateOrder({ paymentStatus: paymentIntent.status })
        break
      }
      case 'payment_intent.succeeded': {
        const result = await updateOrder({
          ...extractPaymentIntentFields(paymentIntent),
          paymentStatus: paymentIntent.status,
        })

        if (!result) {
          reportMissingOrderForPaymentIntentWebhook({
            paymentIntent,
            paymentStatus: paymentIntent.status,
            eventMeta,
          })
          throw new Internal(
            `Missing order for Stripe payment intent: ${paymentIntent.id}`,
          )
        }

        const { justPaid, ...updatedOrder } = result

        if (result.paymentStatus !== 'succeeded') {
          break
        }

        void cancelAdminPaymentErrorAlert(paymentIntent.id).catch(
          (error: unknown) => {
            void log.warn(
              '[QUEUE] Failed to cancel pending admin error alert',
              {
                error,
                paymentId: paymentIntent.id,
              },
            )
          },
        )

        if (!justPaid) {
          void log.info('[STRIPE] Payment succeeded via webhook', {
            paymentId: paymentIntent.id,
          })
          break
        }

        notifyOrderConfirmed(updatedOrder)

        void log.info('[STRIPE] Payment succeeded via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
      case 'payment_intent.amount_capturable_updated': {
        await updateOrder({
          ...extractPaymentIntentFields(paymentIntent),
          paymentStatus: paymentIntent.status,
        })

        void log.info('[STRIPE] Payment capturable via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
      case 'payment_intent.partially_funded': {
        await updateOrder({ paymentStatus: paymentIntent.status })
        break
      }
      case 'payment_intent.payment_failed': {
        await updateOrder({ paymentStatus: paymentIntent.status })

        void log.warn('[STRIPE] Payment failed via webhook', {
          paymentId: paymentIntent.id,
          error: paymentIntent.last_payment_error?.message,
        })
        break
      }
      case 'payment_intent.requires_action': {
        await updateOrder({ paymentStatus: paymentIntent.status })
        break
      }
      case 'payment_intent.processing': {
        await updateOrder({ paymentStatus: paymentIntent.status })
        break
      }
      case 'payment_intent.canceled': {
        const result = await updateOrder({
          ...extractPaymentIntentFields(paymentIntent),
          paymentStatus: 'canceled',
        })

        if (!result) {
          reportMissingOrderForPaymentIntentWebhook({
            paymentIntent,
            paymentStatus: 'canceled',
            eventMeta,
          })
          throw new Internal(
            `Missing order for Stripe payment intent: ${paymentIntent.id}`,
          )
        }

        void log.info('[STRIPE] Payment canceled via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
    }
  } else if (isChargeEvent(event)) {
    const { data, type } = event
    const charge = data.object

    const paymentIntentId = getPaymentIntentId(charge)

    if (!paymentIntentId) {
      void log.info('[STRIPE] Charge event without payment intent reference', {
        chargeId: charge.id,
        eventType: event.type,
      })
      return { received: true }
    }

    switch (type) {
      case 'charge.succeeded':
        void log.info('[STRIPE] Charge succeeded via webhook', {
          paymentId: paymentIntentId,
          chargeId: charge.id,
        })
        break
      case 'charge.updated':
        void log.info('[STRIPE] Charge updated via webhook', {
          paymentId: paymentIntentId,
          chargeId: charge.id,
        })
        break
      case 'charge.refunded':
        void log.info('[STRIPE] Charge refunded via webhook', {
          paymentId: paymentIntentId,
          chargeId: charge.id,
          refundedAmount: charge.amount_refunded,
        })
        break
    }
  } else if (isRefundEvent(event)) {
    const { data } = event
    const refund = data.object

    const paymentIntentId = getPaymentIntentId(refund)

    if (!paymentIntentId) {
      void log.info('[STRIPE] Refund without payment intent reference', {
        refundId: refund.id,
        eventType: event.type,
      })
      return { received: true }
    }

    void log.info('[STRIPE] Refund updated via webhook', {
      paymentId: paymentIntentId,
      refundId: refund.id,
      refundedAmount: refund.amount,
    })
  } else if (isDisputeEvent(event)) {
    const { data, type } = event
    const dispute = data.object

    const paymentIntentId = getPaymentIntentId(dispute)

    if (!paymentIntentId) {
      void log.info('[STRIPE] Dispute without payment intent reference', {
        disputeId: dispute.id,
        eventType: event.type,
      })
      return { received: true }
    }

    switch (type) {
      case 'charge.dispute.created':
        void log.info('[STRIPE] Dispute created via webhook', {
          paymentId: paymentIntentId,
          disputeId: dispute.id,
          status: dispute.status,
        })
        break
      case 'charge.dispute.closed':
        void log.info('[STRIPE] Dispute closed via webhook', {
          paymentId: paymentIntentId,
          disputeId: dispute.id,
          status: dispute.status,
        })
        break
    }
  } else {
    void log.info(`[STRIPE] Unhandled webhook event type: ${event.type}`)
  }

  return { received: true }
}

export async function updateOrderFromWebhook(
  paymentIntent: StripePaymentIntent,
  data: OrderUpdate,
  eventMeta: WebhookEventMeta,
) {
  const { id: paymentIntentId } = paymentIntent
  const { eventType, eventId, eventCreated } = eventMeta
  const resolvedOrder = await resolveOrderForWebhook(paymentIntent)

  if (!resolvedOrder) {
    if (!isCriticalMissingOrderEventType(eventType)) {
      void log.warn('Failed to find order for payment intent', {
        paymentId: paymentIntentId,
        eventType,
        eventId,
        eventCreated,
      })
    }
    return null
  }

  let existingOrder = resolvedOrder
  let updateAttempt = 0
  while (updateAttempt < 5) {
    const lastEventCreated = existingOrder.lastStripeEventCreated ?? null
    const lastEventId = existingOrder.lastStripeEventId ?? null

    if (lastEventCreated !== null && eventCreated < lastEventCreated) {
      void log.warn(
        '[STRIPE] Ignoring stale webhook event by created timestamp',
        {
          paymentId: paymentIntentId,
          eventType,
          eventId,
          eventCreated,
          lastStripeEventCreated: lastEventCreated,
          lastStripeEventId: lastEventId,
        },
      )
      return { ...existingOrder, justPaid: false }
    }

    if (
      lastEventCreated !== null &&
      eventCreated === lastEventCreated &&
      lastEventId === eventId
    ) {
      void log.warn('[STRIPE] Ignoring duplicate webhook event', {
        paymentId: paymentIntentId,
        eventType,
        eventId,
        eventCreated,
        lastStripeEventCreated: lastEventCreated,
        lastStripeEventId: lastEventId,
      })
      return { ...existingOrder, justPaid: false }
    }

    const nextStatus = data.paymentStatus
    const hasTerminalStatus = terminalStatuses.includes(
      existingOrder.paymentStatus,
    )

    if (
      nextStatus &&
      hasTerminalStatus &&
      existingOrder.paymentStatus !== nextStatus
    ) {
      void log.warn(
        '[STRIPE] Ignoring out-of-order terminal status transition',
        {
          paymentId: paymentIntentId,
          eventType,
          eventId,
          eventCreated,
          fromStatus: existingOrder.paymentStatus,
          toStatus: nextStatus,
          lastStripeEventCreated: lastEventCreated,
          lastStripeEventId: lastEventId,
        },
      )
      return { ...existingOrder, justPaid: false }
    }

    const nextStatusRank = getPaymentStatusRank(nextStatus)
    const currentStatusRank = getPaymentStatusRank(existingOrder.paymentStatus)

    if (
      nextStatus &&
      lastEventCreated !== null &&
      eventCreated === lastEventCreated &&
      lastEventId !== eventId &&
      nextStatusRank !== null &&
      currentStatusRank !== null &&
      nextStatusRank < currentStatusRank
    ) {
      void log.warn(
        '[STRIPE] Ignoring same-second regressive status transition',
        {
          paymentId: paymentIntentId,
          eventType,
          eventId,
          eventCreated,
          fromStatus: existingOrder.paymentStatus,
          toStatus: nextStatus,
          lastStripeEventCreated: lastEventCreated,
          lastStripeEventId: lastEventId,
        },
      )
      return { ...existingOrder, justPaid: false }
    }

    const updateData: OrderUpdate = {
      ...data,
      lastStripeEventCreated: eventCreated,
      lastStripeEventId: eventId,
    }

    const existingEmail = existingOrder.email?.trim()
    const orderEmail = existingEmail ? existingOrder.email : data.email
    if (orderEmail !== undefined) updateData.email = orderEmail

    if (data.paymentStatus === 'succeeded' && existingOrder.paidAt == null) {
      updateData.paidAt = new Date()
    }

    const mergedOrderSnapshot = {
      ...existingOrder,
      ...data,
      paymentStatus: data.paymentStatus ?? existingOrder.paymentStatus,
      email: orderEmail ?? null,
      shipping: data.shipping ?? existingOrder.shipping ?? null,
    }

    const reportWebhookSaveFailure = (
      saveFailureReason: 'threw' | 'returned_null',
      saveError?: unknown,
    ) => {
      reportOrderError({
        issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
        message: '[CRITICAL] Webhook order update save failed',
        operation: 'update',
        paymentId: paymentIntentId,
        saveFailureReason,
        saveError,
        dbStatus: existingOrder.paymentStatus,
        stripeStatus: data.paymentStatus,
        additionalContext: {
          eventType,
          eventId,
          eventCreated,
        },
        order: mergedOrderSnapshot,
      })
    }

    try {
      const { order: updatedOrder, becamePaid } =
        await ordersDB.updateOrderIfUnchanged(
          paymentIntentId,
          {
            paymentStatus: existingOrder.paymentStatus,
            lastStripeEventCreated:
              existingOrder.lastStripeEventCreated ?? null,
            lastStripeEventId: existingOrder.lastStripeEventId ?? null,
            paidAt: existingOrder.paidAt ?? null,
          },
          updateData,
        )

      if (!updatedOrder) {
        const latestOrder = await ordersDB.getOrder(paymentIntentId)
        if (!latestOrder) {
          reportWebhookSaveFailure('returned_null')
          throw new Internal('Failed to save webhook order update')
        }

        existingOrder = latestOrder
        updateAttempt += 1
        continue
      }

      return { ...updatedOrder, justPaid: becamePaid }
    } catch (saveError) {
      if (saveError instanceof Internal) {
        throw saveError
      }

      reportWebhookSaveFailure('threw', saveError)
      throw new Internal('Failed to save webhook order update')
    }
  }

  void log.warn('[STRIPE] Could not apply webhook after concurrent updates', {
    paymentId: paymentIntentId,
    eventType,
    eventId,
    eventCreated,
  })
  throw new Internal('Concurrent webhook updates prevented order update')
}
