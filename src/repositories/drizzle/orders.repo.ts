import { eq } from 'drizzle-orm'
import { db } from '@/db'
import model from '@/models'
import { type Order, type OrderCreate, OrderStatus } from '@/types'

const { ordersTable } = model as SQLiteModel

export async function createOrder(order: OrderCreate): Promise<Order | null> {
  const orderInsert = {
    paymentId: order.paymentId,
    paymentIntentStatus: 'processing' as const,
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

  await db.insert(ordersTable).values(orderInsert)

  const orderRecords = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.paymentId, order.paymentId))
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
  await db
    .update(ordersTable)
    .set(fields)
    .where(eq(ordersTable.paymentId, paymentId))

  const orderRecords = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.paymentId, paymentId))
    .limit(1)

  if (!orderRecords.length) {
    return null
  }

  return orderRecords[0]
}

export async function getAllOrders(): Promise<Order[]> {
  const orderRecords = await db.select().from(ordersTable)
  return orderRecords
}
