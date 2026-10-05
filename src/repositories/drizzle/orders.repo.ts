import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  notInArray,
  or,
} from 'drizzle-orm'
import { sqlite } from '@/db'
import model from '@/models'
import { terminalStatuses } from '@/constants/payment'
import type {
  Order,
  OrderInsert,
  OrderPaymentSnapshot,
  OrderReconciliationQuery,
  OrderUpdate,
} from '@/types'

const { ordersTable } = model as SQLiteModel

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
): Promise<{ order: Order | null; linked: boolean }> {
  const existingOrder = await getOrderById(orderId)

  if (!existingOrder) return { order: null, linked: false }
  if (existingOrder.paymentId === paymentId) {
    return { order: existingOrder, linked: false }
  }
  if (existingOrder.paymentId !== null) {
    return { order: null, linked: false }
  }

  const [linkedOrder] = await sqlite
    .update(ordersTable)
    .set({ paymentId, paymentStatus })
    .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.paymentId)))
    .returning()

  if (linkedOrder) return { order: linkedOrder, linked: true }

  const currentOrder = await getOrderById(orderId)
  return {
    order: currentOrder?.paymentId === paymentId ? currentOrder : null,
    linked: false,
  }
}

export async function updateOrder(
  paymentId: string,
  fields: OrderUpdate,
): Promise<{ order: Order | null; becamePaid: boolean }> {
  const shouldAttemptPaidTransition = fields.paidAt instanceof Date

  if (!shouldAttemptPaidTransition) {
    const [updatedOrder] = await sqlite
      .update(ordersTable)
      .set(fields)
      .where(eq(ordersTable.paymentId, paymentId))
      .returning()

    return {
      order: updatedOrder ?? null,
      becamePaid: false,
    }
  }

  const [paidTransitionOrder] = await sqlite
    .update(ordersTable)
    .set(fields)
    .where(
      and(eq(ordersTable.paymentId, paymentId), isNull(ordersTable.paidAt)),
    )
    .returning()

  if (paidTransitionOrder) {
    return {
      order: paidTransitionOrder,
      becamePaid: true,
    }
  }

  const fieldsWithoutPaidAt: OrderUpdate = { ...fields }
  delete fieldsWithoutPaidAt.paidAt

  if (Object.keys(fieldsWithoutPaidAt).length === 0) {
    return {
      order: await getOrder(paymentId),
      becamePaid: false,
    }
  }

  const [updatedOrder] = await sqlite
    .update(ordersTable)
    .set(fieldsWithoutPaidAt)
    .where(eq(ordersTable.paymentId, paymentId))
    .returning()

  return {
    order: updatedOrder ?? null,
    becamePaid: false,
  }
}

export async function updateOrderIfUnchanged(
  paymentId: string,
  expected: OrderPaymentSnapshot,
  fields: OrderUpdate,
): Promise<{ order: Order | null; becamePaid: boolean }> {
  const [updatedOrder] = await sqlite
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

  return {
    order: updatedOrder ?? null,
    becamePaid: Boolean(updatedOrder && fields.paidAt instanceof Date),
  }
}

export async function getAllOrders(): Promise<Order[]> {
  const orderRecords = await sqlite.select().from(ordersTable)
  return orderRecords
}

export async function getOrdersForReconciliation({
  staleBefore,
  checkedBefore,
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
        ),
        or(
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
    .set({ lastReconciledAt: checkedAt })
    .where(and(eq(ordersTable.id, orderId), isNull(ordersTable.paymentId)))
}

export async function getOrdersByEmail(email: string): Promise<Order[]> {
  const orderRecords = await sqlite
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.email, email))
    .orderBy(desc(ordersTable.createdAt))

  return orderRecords
}

export async function deleteOrdersByIds(
  orderIds: number[],
): Promise<Order['id'][]> {
  await sqlite.delete(ordersTable).where(inArray(ordersTable.id, orderIds))
  return orderIds
}
