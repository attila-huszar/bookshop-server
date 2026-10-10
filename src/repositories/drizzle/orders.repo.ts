import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lt,
  notInArray,
  or,
} from 'drizzle-orm'
import { sqlite } from '@/db'
import { ordersTable } from '@/models/sqlite'
import { emailOutboxTable } from '@/models/sqlite/emailOutboxTable'
import {
  orderPaidEmails,
  orderReconciliationFailure,
} from '@/utils/email-job.utils'
import { terminalStatuses } from '@/constants/payment'
import type {
  CmsOrderUpdate,
  Order,
  OrderInsert,
  OrderPaymentSnapshot,
  OrderReconciliationQuery,
  OrderUpdate,
} from '@/types'

export async function getOrderByCheckoutRequestId(
  checkoutRequestId: string,
): Promise<Order | null> {
  const [order] = await sqlite
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.checkoutRequestId, checkoutRequestId))
    .limit(1)

  return order ?? null
}

export async function createCheckoutOrder(
  order: OrderInsert,
): Promise<Order | null> {
  const [createdOrder] = await sqlite
    .insert(ordersTable)
    .values(order)
    .onConflictDoNothing({ target: ordersTable.checkoutRequestId })
    .returning()

  return createdOrder ?? getOrderByCheckoutRequestId(order.checkoutRequestId)
}

export async function getOrder(paymentId: string): Promise<Order | null> {
  const orderRecords = await sqlite
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.paymentId, paymentId))
    .limit(1)

  return orderRecords[0] ?? null
}

export async function getOrderById(id: number): Promise<Order | null> {
  const orderRecords = await sqlite
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, id))
    .limit(1)

  return orderRecords[0] ?? null
}

export async function linkPaymentIntent(
  orderId: number,
  paymentId: string,
  paymentStatus: Order['paymentStatus'],
): Promise<Order | null> {
  const existingOrder = await getOrderById(orderId)

  if (!existingOrder) {
    return null
  }

  if (existingOrder.paymentId === paymentId) {
    return existingOrder
  }

  if (existingOrder.paymentId !== null) {
    return null
  }

  const linkedOrder = sqlite.transaction((tx) => {
    const [order] = tx
      .update(ordersTable)
      .set({ paymentId, paymentStatus })
      .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.paymentId)))
      .returning()
      .all()

    return order
  })

  if (linkedOrder) {
    return linkedOrder
  }

  const currentOrder = await getOrderById(orderId)

  return currentOrder?.paymentId === paymentId ? currentOrder : null
}

/** Customer corrections cannot alter payment state or the checkout snapshot. */
export async function updateOrder(
  paymentId: string,
  fields: CmsOrderUpdate,
): Promise<Order | null> {
  const [order] = await sqlite
    .update(ordersTable)
    .set(fields)
    .where(eq(ordersTable.paymentId, paymentId))
    .returning()

  return order ?? null
}

export async function updateOrderIfUnchanged(
  paymentId: string,
  expected: OrderPaymentSnapshot,
  fields: OrderUpdate,
): Promise<Order | null> {
  return sqlite.transaction((tx) => {
    const [updatedOrder] = tx
      .update(ordersTable)
      .set(fields)
      .where(
        and(
          eq(ordersTable.paymentId, paymentId),
          eq(ordersTable.id, expected.id),
          eq(ordersTable.total, expected.total),
          eq(ordersTable.currency, expected.currency),
          expected.email === null
            ? isNull(ordersTable.email)
            : eq(ordersTable.email, expected.email),
          eq(ordersTable.updatedAt, expected.updatedAt),
          eq(ordersTable.paymentStatus, expected.paymentStatus),
          expected.lastStripeEventCreated === null
            ? isNull(ordersTable.lastStripeEventCreated)
            : eq(
                ordersTable.lastStripeEventCreated,
                expected.lastStripeEventCreated,
              ),
          expected.lastStripeEventId === null
            ? isNull(ordersTable.lastStripeEventId)
            : eq(ordersTable.lastStripeEventId, expected.lastStripeEventId),
          expected.lastReconciledAt === null
            ? isNull(ordersTable.lastReconciledAt)
            : eq(ordersTable.lastReconciledAt, expected.lastReconciledAt),
          expected.paidAt === null
            ? isNull(ordersTable.paidAt)
            : eq(ordersTable.paidAt, expected.paidAt),
        ),
      )
      .returning()
      .all()

    const becamePaid = Boolean(
      updatedOrder && expected.paidAt === null && fields.paidAt instanceof Date,
    )

    if (updatedOrder && becamePaid) {
      tx.insert(emailOutboxTable)
        .values(orderPaidEmails(updatedOrder))
        .onConflictDoNothing()
        .run()
    }

    return updatedOrder ?? null
  })
}

export async function getAllOrders(): Promise<Order[]> {
  const orderRecords = await sqlite.select().from(ordersTable)

  return orderRecords
}

export async function getOrdersForReconciliation({
  staleBefore,
  checkedBefore,
  failedCheckedBefore,
  terminalCheckedBefore,
  limit,
}: OrderReconciliationQuery): Promise<Order[]> {
  return await sqlite
    .select()
    .from(ordersTable)
    .where(
      and(
        lt(ordersTable.updatedAt, staleBefore),
        or(
          isNull(ordersTable.lastReconciliationAttemptAt),
          lt(ordersTable.lastReconciliationAttemptAt, checkedBefore),
          and(
            gt(ordersTable.reconciliationFailures, 0),
            lt(ordersTable.lastReconciliationAttemptAt, failedCheckedBefore),
          ),
        ),
        or(
          gt(ordersTable.reconciliationFailures, 0),
          isNull(ordersTable.lastReconciledAt),
          lt(ordersTable.lastReconciledAt, terminalCheckedBefore),
          and(
            or(
              notInArray(ordersTable.paymentStatus, terminalStatuses),
              and(
                eq(ordersTable.paymentStatus, 'succeeded'),
                isNull(ordersTable.paidAt),
              ),
            ),
            lt(ordersTable.lastReconciledAt, checkedBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(ordersTable.lastReconciliationAttemptAt), asc(ordersTable.id))
    .limit(limit)
}

export async function markOrderReconciliationAttempted(
  orderId: number,
  attemptedAt: Date,
): Promise<void> {
  await sqlite
    .update(ordersTable)
    .set({ lastReconciliationAttemptAt: attemptedAt })
    .where(eq(ordersTable.id, orderId))
}

export async function markUnlinkedOrderReconciled(
  orderId: number,
  checkedAt: Date,
): Promise<void> {
  await sqlite
    .update(ordersTable)
    .set({
      lastReconciledAt: checkedAt,
      reconciliationFailures: 0,
      reconciliationAlertId: null,
    })
    .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.paymentId)))
}

/** Persist a failed check and its optional admin alert in one transaction. */
export async function recordReconciliationFailure(
  expected: Order,
  reason: string,
  attemptedAt: Date,
): Promise<void> {
  sqlite.transaction(
    (tx) => {
      const [order] = tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, expected.id))
        .all()

      if (
        order?.reconciliationFailures !== expected.reconciliationFailures ||
        order.lastReconciliationAttemptAt?.getTime() !==
          attemptedAt.getTime() ||
        (order.lastReconciledAt !== null &&
          order.lastReconciledAt >= attemptedAt)
      ) {
        return
      }

      const failure = orderReconciliationFailure(order, reason)
      tx.update(ordersTable)
        .set(failure.fields)
        .where(eq(ordersTable.id, order.id))
        .run()

      if (failure.email) {
        tx.insert(emailOutboxTable)
          .values(failure.email)
          .onConflictDoNothing()
          .run()
      }
    },
    { behavior: 'immediate' },
  )
}

export async function getOrdersByEmail(email: string): Promise<Order[]> {
  const orderRecords = await sqlite
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.email, email))
    .orderBy(desc(ordersTable.createdAt))

  return orderRecords
}

/** Archiving changes CMS visibility; payment and customer lookups still see the row. */
export async function setOrdersDeleted(
  orderIds: number[],
  deleted: boolean,
): Promise<number> {
  const changed = await sqlite
    .update(ordersTable)
    .set({ deletedAt: deleted ? new Date() : null })
    .where(
      and(
        inArray(ordersTable.id, orderIds),
        deleted
          ? isNull(ordersTable.deletedAt)
          : isNotNull(ordersTable.deletedAt),
      ),
    )
    .returning({ id: ordersTable.id })

  return changed.length
}
