import { eq } from 'drizzle-orm'
import { db } from '../db'
import { orders } from './repoHandler'
import { type Order, type OrderRequest, OrderStatus } from '../types'

export async function createOrder(values: OrderRequest): Promise<Order | null> {
  const orderInsert: typeof orders.$inferInsert = {
    paymentId: values.paymentId,
    paymentIntentStatus: 'processing',
    orderStatus: OrderStatus.Pending,
    firstName: values.userFirstName,
    lastName: values.userLastName,
    email: values.userEmail,
    phone: values.userPhone ?? null,
    address: values.userAddress,
    total: values.orderTotal,
    currency: values.orderCurrency,
    items: values.orderItems,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  await db.insert(orders).values(orderInsert)

  const orderRecords = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentId, values.paymentId))
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
