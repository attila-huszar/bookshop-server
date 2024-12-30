import { eq } from 'drizzle-orm'
import { db } from '../db'
import { orders } from './repoHandler'
import { type Order, OrderStatus } from '../types'

export async function createOrder(order: Order): Promise<Order | null> {
  const orderInsert: typeof orders.$inferInsert = {
    paymentId: order.paymentId,
    paymentIntentStatus: 'processing',
    orderStatus: OrderStatus.Pending,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    phone: order.phone ?? null,
    address: order.address,
    total: order.total,
    currency: order.currency,
    items: order.items,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.insert(orders).values(orderInsert)

  const orderRecords = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentId, order.paymentId))
    .limit(1)

  if (!orderRecords.length) {
    return null
  }

  return orderRecords[0]
}

export async function updateOrder(
  paymentId: string,
  fields: Partial<Order>,
): Promise<Order | null> {
  await db.update(orders).set(fields).where(eq(orders.paymentId, paymentId))

  const orderRecords = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentId, paymentId))
    .limit(1)

  if (!orderRecords.length) {
    return null
  }

  return orderRecords[0]
}
