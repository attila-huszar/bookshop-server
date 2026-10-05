import { ordersDB, usersDB } from '@/repositories'
import { extractPaymentIntentFields } from '@/utils'
import { log, stripe } from '@/libs'
import { cancelAdminPaymentErrorAlert, enqueueEmail } from '@/queues'
import { terminalStatuses, userMessage } from '@/constants'
import { Internal } from '@/errors/Internal'
import { NotFound } from '@/errors/NotFound'
import {
  AdminNotification,
  IssueCode,
  type Order,
  type OrderPaymentSnapshot,
  type OrderUpdate,
  type PaymentIntentEventMeta,
  type StripePaymentIntent,
} from '@/types'

const reconciliationRequestOptions = { timeout: 10_000, maxNetworkRetries: 1 }

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
    (lastStripeEventCreated === eventCreated ||
      (order.lastReconciledAt != null &&
        eventCreated <= Math.floor(order.lastReconciledAt.getTime() / 1000))) &&
    order.paymentStatus !== nextStatus
  ) {
    // Stripe timestamps have second precision. Check conflicts from the same
    // second or from before the latest reconciliation against the live intent.
    const currentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)
    if (currentIntent.status !== nextStatus) {
      void log.warn(
        '[STRIPE] Ignoring stale status after checking current intent',
        {
          ...context,
          fromStatus: order.paymentStatus,
          toStatus: nextStatus,
          stripeStatus: currentIntent.status,
        },
      )
      return true
    }
  }

  return false
}

function paymentSnapshot(order: Order): OrderPaymentSnapshot {
  return {
    id: order.id,
    total: order.total,
    currency: order.currency,
    email: order.email,
    updatedAt: order.updatedAt,
    paymentStatus: order.paymentStatus,
    lastStripeEventCreated: order.lastStripeEventCreated ?? null,
    lastStripeEventId: order.lastStripeEventId ?? null,
    lastReconciledAt: order.lastReconciledAt ?? null,
    paidAt: order.paidAt ?? null,
  }
}

function preparePaymentUpdate(order: Order, data: OrderUpdate): OrderUpdate {
  const updates = { ...data }
  if (order.email?.trim()) updates.email = order.email
  if (data.paymentStatus === 'succeeded' && order.paidAt == null)
    updates.paidAt = new Date()
  return updates
}

async function savePaymentUpdate(order: Order, updates: OrderUpdate) {
  const result = await ordersDB.updateOrderIfUnchanged(
    order.paymentId!,
    paymentSnapshot(order),
    updates,
  )
  if (result.order?.paymentStatus === 'succeeded') {
    await cancelAdminPaymentErrorAlert(result.order.paymentId!).catch(
      (error: unknown) => {
        void log.warn('[QUEUE] Failed to cancel pending admin error alert', {
          error,
          paymentId: order.paymentId,
        })
      },
    )
    if (result.becamePaid) {
      enqueueEmail('orderConfirmation', { order: result.order })
      enqueueEmail('adminPaymentNotification', {
        order: result.order,
        notificationType: AdminNotification.Confirmed,
      })
    }
  }
  return result
}

/** Pull an authoritative Stripe snapshot without inventing a webhook event. */
export async function reconcileOrderPayment(orderId: number): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let order = await ordersDB.getOrderById(orderId)
    if (!order) return
    let paymentId = order.paymentId

    if (!paymentId) {
      const matches = await stripe.paymentIntents.search(
        { query: `metadata['orderId']:'${order.id}'`, limit: 2 },
        reconciliationRequestOptions,
      )
      if (matches.has_more || matches.data.length > 1)
        throw new Error('Multiple Stripe payments match the same order')
      paymentId = matches.data[0]?.id ?? null
      if (!paymentId) {
        await ordersDB.markUnlinkedOrderReconciled(order.id, new Date())
        return
      }
    }

    // Re-fetch on every CAS retry; never overwrite a newer webhook with an old response.
    const intent = await stripe.paymentIntents.retrieve(
      paymentId,
      {},
      reconciliationRequestOptions,
    )
    if (
      intent.id !== paymentId ||
      (intent.metadata.orderId && intent.metadata.orderId !== String(order.id))
    ) {
      throw new Error('Stripe payment does not belong to this order')
    }
    if (
      intent.amount !== Math.round(order.total * 100) ||
      intent.currency.toUpperCase() !== order.currency.toUpperCase()
    ) {
      throw new Error(
        'Stripe payment amount or currency differs from the order',
      )
    }
    if (order.paidAt != null && intent.status !== 'succeeded') {
      throw new Error(
        'Refusing to downgrade an already paid order; manual review required',
      )
    }

    if (!order.paymentId) {
      if (intent.metadata.orderId !== String(order.id))
        throw new Error('Missing order metadata on unlinked Stripe payment')
      order = await findOrLinkOrderForPaymentIntent(intent)
      if (order?.id !== orderId)
        throw new Error('Failed to link Stripe payment to its draft order')
      continue
    }

    const updates = preparePaymentUpdate(order, {
      ...extractPaymentIntentFields(intent),
      paymentStatus: intent.status,
      lastReconciledAt: new Date(),
    })
    const { order: updatedOrder } = await savePaymentUpdate(order, updates)
    if (updatedOrder) {
      if (
        order.paymentStatus !== updatedOrder.paymentStatus ||
        (order.paidAt == null && updatedOrder.paidAt != null)
      ) {
        void log.info('[STRIPE] Reconciled order payment', {
          orderId,
          paymentId,
          fromStatus: order.paymentStatus,
          toStatus: updatedOrder.paymentStatus,
        })
      }
      return
    }
  }
  throw new Internal('Concurrent updates prevented order reconciliation')
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

    const updateData = preparePaymentUpdate(order, {
      ...data,
      lastStripeEventCreated: eventMeta.eventCreated,
      lastStripeEventId: eventMeta.eventId,
    })

    try {
      const { order: updatedOrder, becamePaid } = await savePaymentUpdate(
        order,
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
