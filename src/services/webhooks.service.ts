import { Stripe } from 'stripe'
import { env } from '@/config'
import { ordersDB } from '@/repositories'
import {
  extractPaymentIntentFields,
  getPaymentIntentId,
  sendAdminNotificationEmail,
  throwCriticalOrderPersistFailure,
} from '@/utils'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { jobOpts, QUEUE, terminalStatuses } from '@/constants'
import { BadRequest, Internal } from '@/errors'
import {
  AdminNotification,
  isChargeEvent,
  isDisputeEvent,
  isPaymentIntentEvent,
  isRefundEvent,
  IssueCode,
  type OrderConfirmationEmailProps,
  type OrderUpdate,
  type PaymentIntentStatus,
  type StripeEvent,
  type StripePaymentIntent,
} from '@/types'

const stripe = new Stripe(env.stripeSecret!)

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

const getPaymentStatusRank = (status?: PaymentIntentStatus): number =>
  status ? (paymentStatusRank[status] ?? 0) : 0

const isCriticalMissingOrderEventType = (eventType: string): boolean =>
  eventType === 'payment_intent.succeeded' ||
  eventType === 'payment_intent.canceled'

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

  sendAdminNotificationEmail({
    notificationType: AdminNotification.Error,
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

    switch (type) {
      case 'payment_intent.created': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          eventMeta,
        )
        break
      }
      case 'payment_intent.succeeded': {
        const result = await updateOrderFromWebhook(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: paymentIntent.status,
          },
          eventMeta,
        )

        if (!result) {
          reportMissingOrderForPaymentIntentWebhook({
            paymentIntent,
            paymentStatus: paymentIntent.status,
            eventMeta,
          })
          return { received: true }
        }

        const { justPaid, ...updatedOrder } = result

        if (!updatedOrder.email || !updatedOrder.firstName) {
          void log.error(
            'Order missing email or first name for confirmation email',
            { paymentId: paymentIntent.id },
          )
        } else if (justPaid) {
          const jobData: OrderConfirmationEmailProps = {
            type: QUEUE.EMAIL.JOB.ORDER_CONFIRMATION,
            toAddress: updatedOrder.email,
            toName: updatedOrder.firstName,
            order: updatedOrder,
          }

          void emailQueue
            .add(QUEUE.EMAIL.JOB.ORDER_CONFIRMATION, jobData, jobOpts)
            .catch((error: Error) => {
              void log.error(
                '[QUEUE] Order confirmation email queueing failed',
                { error, paymentId: paymentIntent.id },
              )
            })

          sendAdminNotificationEmail({
            order: updatedOrder,
            notificationType: AdminNotification.Confirmed,
          })
        }

        void log.info('[STRIPE] Payment succeeded via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
      case 'payment_intent.amount_capturable_updated': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: paymentIntent.status,
          },
          eventMeta,
        )

        void log.info('[STRIPE] Payment capturable via webhook', {
          paymentId: paymentIntent.id,
        })
        break
      }
      case 'payment_intent.partially_funded': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          eventMeta,
        )
        break
      }
      case 'payment_intent.payment_failed': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          eventMeta,
        )

        void log.warn('[STRIPE] Payment failed via webhook', {
          paymentId: paymentIntent.id,
          error: paymentIntent.last_payment_error?.message,
        })
        break
      }
      case 'payment_intent.requires_action': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          eventMeta,
        )
        break
      }
      case 'payment_intent.processing': {
        await updateOrderFromWebhook(
          paymentIntent.id,
          {
            paymentStatus: paymentIntent.status,
          },
          eventMeta,
        )
        break
      }
      case 'payment_intent.canceled': {
        const result = await updateOrderFromWebhook(
          paymentIntent.id,
          {
            ...extractPaymentIntentFields(paymentIntent),
            paymentStatus: 'canceled',
          },
          eventMeta,
        )

        if (!result) {
          reportMissingOrderForPaymentIntentWebhook({
            paymentIntent,
            paymentStatus: 'canceled',
            eventMeta,
          })
          return { received: true }
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
  paymentIntentId: string,
  data: OrderUpdate,
  eventMeta: WebhookEventMeta,
) {
  const { eventType, eventId, eventCreated } = eventMeta
  const existingOrder = await ordersDB.getOrder(paymentIntentId)

  if (!existingOrder) {
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
    void log.warn('[STRIPE] Ignoring out-of-order terminal status transition', {
      paymentId: paymentIntentId,
      eventType,
      eventId,
      eventCreated,
      fromStatus: existingOrder.paymentStatus,
      toStatus: nextStatus,
      lastStripeEventCreated: lastEventCreated,
      lastStripeEventId: lastEventId,
    })
    return { ...existingOrder, justPaid: false }
  }

  if (
    nextStatus &&
    lastEventCreated !== null &&
    eventCreated === lastEventCreated &&
    lastEventId !== eventId &&
    getPaymentStatusRank(nextStatus) <
      getPaymentStatusRank(existingOrder.paymentStatus)
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
  const justPaid = data.paymentStatus === 'succeeded' && !existingOrder.paidAt

  if (justPaid) {
    updateData.paidAt = new Date()
  }

  try {
    const updatedOrder = await ordersDB.updateOrder(paymentIntentId, updateData)
    return updatedOrder ? { ...updatedOrder, justPaid } : null
  } catch (persistError) {
    throwCriticalOrderPersistFailure({
      issueCode: IssueCode.WEBHOOK_ORDER_PERSIST_FAILED,
      message: '[CRITICAL] Webhook order update persistence failed',
      throwMessage: 'Failed to persist webhook order update',
      operation: 'update',
      paymentId: paymentIntentId,
      persistFailureReason: 'threw',
      persistError,
      dbStatus: existingOrder.paymentStatus,
      stripeStatus: data.paymentStatus,
      additionalContext: {
        eventType,
        eventId,
        eventCreated,
      },
      order: {
        paymentId: existingOrder.paymentId,
        paymentStatus: data.paymentStatus ?? existingOrder.paymentStatus,
        items: existingOrder.items,
        total: existingOrder.total,
        currency: existingOrder.currency,
        firstName: existingOrder.firstName,
        lastName: existingOrder.lastName,
        email: existingOrder.email,
        shipping: existingOrder.shipping,
      },
    })
  }
}
