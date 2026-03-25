import { and, desc, eq, inArray, isNull } from 'drizzle-orm'
import { sqlite } from '@/db'
import model from '@/models'
import type { Order, OrderInsert, OrderUpdate } from '@/types'

const { ordersTable } = model as SQLiteModel

export async function createOrder(order: OrderInsert): Promise<Order | null> {
  const [createdOrder] = await sqlite
    .insert(ordersTable)
    .values(order)
    .returning()
  return createdOrder ?? null
}

export async function getOrder(paymentId: string): Promise<Order | null> {
  const orderRecords = await sqlite
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.paymentId, paymentId))
    .limit(1)
  return orderRecords[0] ?? null
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

export async function getAllOrders(): Promise<Order[]> {
  const orderRecords = await sqlite.select().from(ordersTable)
  return orderRecords
}

export async function getOrdersByEmail(email: string): Promise<Order[]> {
  const orderRecords = await sqlite
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.email, email))
    .orderBy(desc(ordersTable.createdAt))

  return orderRecords
}

export async function insertOrder(order: OrderInsert): Promise<Order | null> {
  const [createdOrder] = await sqlite
    .insert(ordersTable)
    .values(order)
    .returning()
  return createdOrder ?? null
}

export async function deleteOrdersByIds(
  orderIds: number[],
): Promise<Order['id'][]> {
  await sqlite.delete(ordersTable).where(inArray(ordersTable.id, orderIds))
  return orderIds
}
