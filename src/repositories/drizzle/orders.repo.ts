import { eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import model from '@/models'
import { defaultCurrency } from '@/constants'
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
    currency: defaultCurrency,
    items: order.items,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const [createdOrder] = await db
    .insert(ordersTable)
    .values(orderInsert)
    .returning()

  return createdOrder ?? null
}

export async function getOrderByPaymentId(
  paymentId: string,
): Promise<Order | null> {
  const orderRecords = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.paymentId, paymentId))
    .limit(1)

  return orderRecords[0] ?? null
}

export async function updateOrder(
  paymentId: string,
  fields: Partial<Order>,
): Promise<Order | null> {
  const [updatedOrder] = await db
    .update(ordersTable)
    .set(fields)
    .where(eq(ordersTable.paymentId, paymentId))
    .returning()

  return updatedOrder ?? null
}

export async function getAllOrders(): Promise<Order[]> {
  const orderRecords = await db.select().from(ordersTable)
  return orderRecords
}

export async function deleteOrdersByIds(
  orderIds: number[],
): Promise<Order['id'][]> {
  await db.delete(ordersTable).where(inArray(ordersTable.id, orderIds))

  return orderIds
}
