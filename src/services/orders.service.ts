import { ordersDB, usersDB } from '@/repositories'
import { log, stripe } from '@/libs'
import { enqueueEmail } from '@/queues'
import { terminalStatuses, userMessage } from '@/constants'
import { Internal } from '@/errors/Internal'
import { NotFound } from '@/errors/NotFound'
import {
  AdminNotification,
  IssueCode,
  type Order,
  type OrderUpdate,
  type PaymentIntentEventMeta,
  type StripePaymentIntent,
} from '@/types'

export async function getUserOrders(uuid: string): Promise<Order[]> {
  const user = await usersDB.getUserBy('uuid', uuid)

  if (!user) {
    throw new NotFound(userMessage.notFound)
  }

  return await ordersDB.getOrdersByEmail(user.email)
}

async function findOrLinkOrderForPaymentIntent(
  paymentIntent: StripePaymentIntent,
): Promise<Order | null> {
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

async function shouldIgnorePaymentIntentEvent(
  order: Order,
  paymentIntentId: string,
  nextStatus: OrderUpdate['paymentStatus'],
  { eventType, eventId, eventCreated }: PaymentIntentEventMeta,
): Promise<boolean> {
  const lastStripeEventCreated = order.lastStripeEventCreated ?? null
  const lastStripeEventId = order.lastStripeEventId ?? null
  const context = {
    paymentId: paymentIntentId,
    eventType,
    eventId,
    eventCreated,
    lastStripeEventCreated,
    lastStripeEventId,
  }

  if (
    lastStripeEventCreated !== null &&
    eventCreated < lastStripeEventCreated
  ) {
    void log.warn(
      '[STRIPE] Ignoring stale webhook event by created timestamp',
      context,
    )
    return true
  }

  if (
    lastStripeEventCreated === eventCreated &&
    lastStripeEventId === eventId
  ) {
    void log.warn('[STRIPE] Ignoring duplicate webhook event', context)
    return true
  }

  if (
    nextStatus &&
    terminalStatuses.includes(order.paymentStatus) &&
    order.paymentStatus !== nextStatus
  ) {
    void log.warn('[STRIPE] Ignoring out-of-order terminal status transition', {
      ...context,
      fromStatus: order.paymentStatus,
      toStatus: nextStatus,
    })
    return true
  }

  if (
    nextStatus &&
    lastStripeEventCreated === eventCreated &&
    order.paymentStatus !== nextStatus
  ) {
    // Stripe timestamps have second precision. Check the current intent when
    // two different statuses arrive in the same second.
    const currentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (currentIntent.status !== nextStatus) {
      void log.warn('[STRIPE] Ignoring same-second stale status transition', {
        ...context,
        fromStatus: order.paymentStatus,
        toStatus: nextStatus,
        stripeStatus: currentIntent.status,
      })
      return true
    }
  }

  return false
}

function reportWebhookSaveFailure(
  order: Order,
  data: OrderUpdate,
  eventMeta: PaymentIntentEventMeta,
  reason: 'threw' | 'returned_null',
  error?: unknown,
): void {
  const orderSnapshot = {
    ...order,
    ...data,
    paymentStatus: data.paymentStatus ?? order.paymentStatus,
    shipping: data.shipping ?? order.shipping ?? null,
  }

  void log.error('[CRITICAL] Webhook order update save failed', {
    issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
    entity: 'order',
    operation: 'update',
    paymentId: order.paymentId,
    saveFailureReason: reason,
    dbStatus: order.paymentStatus,
    stripeStatus: data.paymentStatus,
    error,
    ...eventMeta,
  })

  enqueueEmail('adminPaymentNotification', {
    notificationType: AdminNotification.Error,
    order: orderSnapshot,
    source: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
  })
}

export async function applyPaymentIntentWebhookToOrder(
  paymentIntent: StripePaymentIntent,
  data: OrderUpdate,
  eventMeta: PaymentIntentEventMeta,
): Promise<{ order: Order; becamePaid: boolean } | null> {
  const paymentIntentId = paymentIntent.id
  let order = await findOrLinkOrderForPaymentIntent(paymentIntent)

  if (!order) return null

  for (let attempt = 0; attempt < 5; attempt++) {
    if (
      await shouldIgnorePaymentIntentEvent(
        order,
        paymentIntentId,
        data.paymentStatus,
        eventMeta,
      )
    ) {
      return { order, becamePaid: false }
    }

    const updateData: OrderUpdate = {
      ...data,
      lastStripeEventCreated: eventMeta.eventCreated,
      lastStripeEventId: eventMeta.eventId,
    }

    if (order.email?.trim()) updateData.email = order.email
    if (data.paymentStatus === 'succeeded' && order.paidAt == null) {
      updateData.paidAt = new Date()
    }

    try {
      const { order: updatedOrder, becamePaid } =
        await ordersDB.updateOrderIfUnchanged(
          paymentIntentId,
          {
            paymentStatus: order.paymentStatus,
            lastStripeEventCreated: order.lastStripeEventCreated ?? null,
            lastStripeEventId: order.lastStripeEventId ?? null,
            paidAt: order.paidAt ?? null,
          },
          updateData,
        )

      if (updatedOrder) return { order: updatedOrder, becamePaid }

      const latestOrder = await ordersDB.getOrder(paymentIntentId)
      if (!latestOrder) {
        reportWebhookSaveFailure(order, updateData, eventMeta, 'returned_null')
        throw new Internal('Failed to save webhook order update')
      }

      order = latestOrder
    } catch (error) {
      if (error instanceof Internal) throw error

      reportWebhookSaveFailure(order, updateData, eventMeta, 'threw', error)
      throw new Internal('Failed to save webhook order update')
    }
  }

  void log.warn('[STRIPE] Could not apply webhook after concurrent updates', {
    paymentId: paymentIntentId,
    ...eventMeta,
  })
  throw new Internal('Concurrent webhook updates prevented order update')
}
