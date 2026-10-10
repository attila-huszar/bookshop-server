import { ordersDB } from '@/repositories'
import { extractPaymentIntentFields } from '@/utils'
import {
  ReconciliationFailure,
  reconciliationFailureReason,
} from '@/utils/reconciliation.utils'
import { log, stripe } from '@/libs'
import { terminalStatuses } from '@/constants'
import { reconciliationPolicy } from '@/constants/reconciliation'
import { Internal } from '@/errors/Internal'
import {
  IssueCode,
  type Order,
  type OrderPaymentSnapshot,
  type OrderUpdate,
  type PaymentIntentEventMeta,
  type StripePaymentIntent,
  type User,
} from '@/types'

const reconciliationRequestOptions = { timeout: 10_000, maxNetworkRetries: 1 }

export async function getUserOrders(
  user: Pick<User, 'email'>,
): Promise<Order[]> {
  return await ordersDB.getOrdersByEmail(user.email)
}

async function findOrLinkOrderForPaymentIntent(
  paymentIntent: StripePaymentIntent,
): Promise<Order | null> {
  const existingOrder = await ordersDB.getOrder(paymentIntent.id)

  if (existingOrder) {
    return existingOrder
  }

  const orderId = Number(paymentIntent.metadata?.orderId)

  if (!Number.isSafeInteger(orderId) || orderId <= 0) {
    return null
  }

  const draft = await ordersDB.getOrderById(orderId)

  if (
    !draft ||
    draft.checkoutRequestId !== paymentIntent.metadata.checkoutRequestId ||
    paymentIntent.amount !== Math.round(draft.total * 100) ||
    paymentIntent.currency.toUpperCase() !== draft.currency.toUpperCase()
  ) {
    return null
  }

  return await ordersDB.linkPaymentIntent(
    orderId,
    paymentIntent.id,
    paymentIntent.status,
  )
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

  if (order.email?.trim()) {
    updates.email = order.email
  }

  if (data.paymentStatus === 'succeeded' && order.paidAt == null) {
    updates.paidAt = new Date()
  }

  if (updates.lastReconciledAt) {
    updates.reconciliationFailures = 0
    updates.reconciliationAlertId = null
  }

  return updates
}

/** Pull an authoritative Stripe snapshot without inventing a webhook event. */
export async function reconcileOrderPayment(
  orderId: number,
): Promise<Order | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let order = await ordersDB.getOrderById(orderId)

    if (!order) {
      return null
    }

    let paymentId = order.paymentId

    if (!paymentId) {
      const matches = await stripe.paymentIntents.search(
        {
          query: `metadata['orderId']:'${order.id}' AND metadata['checkoutRequestId']:'${order.checkoutRequestId}'`,
          limit: 2,
        },
        reconciliationRequestOptions,
      )

      if (matches.has_more || matches.data.length > 1) {
        throw new ReconciliationFailure(
          'Multiple Stripe payments match the same order. Manual review is required.',
        )
      }

      paymentId = matches.data[0]?.id ?? null

      if (!paymentId) {
        await ordersDB.markUnlinkedOrderReconciled(order.id, new Date())

        return order
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
      intent.metadata.orderId !== String(order.id) ||
      intent.metadata.checkoutRequestId !== order.checkoutRequestId
    ) {
      throw new ReconciliationFailure(
        'Stripe payment does not belong to this order. The checkout references differ.',
      )
    }

    if (
      intent.amount !== Math.round(order.total * 100) ||
      intent.currency.toUpperCase() !== order.currency.toUpperCase()
    ) {
      throw new ReconciliationFailure(
        'Stripe payment amount or currency differs from the order',
      )
    }

    if (order.paidAt != null && intent.status !== 'succeeded') {
      throw new ReconciliationFailure(
        'Refusing to downgrade an already paid order; manual review required',
      )
    }

    if (!order.paymentId) {
      order = await findOrLinkOrderForPaymentIntent(intent)

      if (order?.id !== orderId) {
        throw new ReconciliationFailure(
          'Failed to link Stripe payment to its draft order',
        )
      }

      continue
    }

    const updates = preparePaymentUpdate(order, {
      ...extractPaymentIntentFields(intent),
      paymentStatus: intent.status,
      lastReconciledAt: new Date(),
    })
    const updatedOrder = await ordersDB.updateOrderIfUnchanged(
      order.paymentId,
      paymentSnapshot(order),
      updates,
    )

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

      return updatedOrder
    }
  }

  throw new ReconciliationFailure(
    'Concurrent updates prevented order reconciliation',
  )
}

export async function reconcileStaleOrders(): Promise<{
  checked: number
  failed: number
}> {
  const startedAt = Date.now()
  const orders = await ordersDB.getOrdersForReconciliation({
    staleBefore: new Date(startedAt - reconciliationPolicy.minimumOrderAgeMs),
    checkedBefore: new Date(
      startedAt - reconciliationPolicy.pendingCheckIntervalMs,
    ),
    failedCheckedBefore: new Date(
      startedAt - reconciliationPolicy.failureRetryIntervalMs,
    ),
    terminalCheckedBefore: new Date(
      startedAt - reconciliationPolicy.terminalAuditIntervalMs,
    ),
    limit: reconciliationPolicy.batchSize,
  })
  let checked = 0
  let failed = 0

  for (const order of orders) {
    if (
      checked >= reconciliationPolicy.batchSize ||
      Date.now() - startedAt >= reconciliationPolicy.runBudgetMs
    ) {
      break
    }

    checked++
    const attemptedAt = new Date()

    try {
      // Pace failed checks too, so persistently broken orders cannot monopolize a batch.
      await ordersDB.markOrderReconciliationAttempted(order.id, attemptedAt)
      await reconcileOrderPayment(order.id)
    } catch (error) {
      failed++
      void log.error('[STRIPE] Order reconciliation failed', {
        error,
        orderId: order.id,
        paymentId: order.paymentId,
      })

      try {
        await ordersDB.recordReconciliationFailure(
          order,
          reconciliationFailureReason(error),
          attemptedAt,
        )
      } catch (recordError) {
        void log.error(
          '[STRIPE] Could not persist reconciliation failure or alert',
          { error: recordError, orderId: order.id, paymentId: order.paymentId },
        )
      }
    }
  }

  const result = { checked, failed }

  void log.info('[STRIPE] Order reconciliation completed', result)

  return result
}

function reportWebhookSaveFailure(
  order: Order,
  data: OrderUpdate,
  eventMeta: PaymentIntentEventMeta,
  reason: 'threw' | 'returned_null',
  error?: unknown,
): void {
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
}

export async function applyPaymentIntentWebhookToOrder(
  paymentIntent: StripePaymentIntent,
  data: OrderUpdate,
  eventMeta: PaymentIntentEventMeta,
): Promise<Order | null> {
  const paymentIntentId = paymentIntent.id
  let order = await findOrLinkOrderForPaymentIntent(paymentIntent)

  if (!order) {
    return null
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    if (
      await shouldIgnorePaymentIntentEvent(
        order,
        paymentIntentId,
        data.paymentStatus,
        eventMeta,
      )
    ) {
      return order
    }

    const updateData = preparePaymentUpdate(order, {
      ...data,
      lastStripeEventCreated: eventMeta.eventCreated,
      lastStripeEventId: eventMeta.eventId,
    })

    try {
      const updatedOrder = await ordersDB.updateOrderIfUnchanged(
        paymentIntentId,
        paymentSnapshot(order),
        updateData,
      )

      if (updatedOrder) {
        return updatedOrder
      }

      const latestOrder = await ordersDB.getOrder(paymentIntentId)

      if (!latestOrder) {
        reportWebhookSaveFailure(order, updateData, eventMeta, 'returned_null')

        throw new Internal('Failed to save webhook order update')
      }

      order = latestOrder
    } catch (error) {
      if (error instanceof Internal) {
        throw error
      }

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
