import model from '@/models'
import { type Order, type OrderInsert, OrderStatus } from '@/types'

const { OrderModel } = model as MongoModel

export async function createOrder(
  order: OrderInsert,
): Promise<WithDateTimestamps<Order> | null> {
  const orderInsert = {
    paymentId: order.paymentId,
    paymentIntentStatus: 'processing',
    orderStatus: OrderStatus.Pending,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    shipping: order.shipping,
    total: order.total,
    currency: order.currency,
    items: order.items,
  }

  const created = await OrderModel.create(orderInsert)
  const savedOrder = created.toObject()

  return {
    id: savedOrder.id,
    paymentId: savedOrder.paymentId,
    paymentIntentStatus: savedOrder.paymentIntentStatus,
    orderStatus: savedOrder.orderStatus,
    total: savedOrder.total,
    currency: savedOrder.currency,
    items: savedOrder.items,
    firstName: savedOrder.firstName,
    lastName: savedOrder.lastName,
    email: savedOrder.email,
    shipping: savedOrder.shipping,
    createdAt: savedOrder.createdAt,
    updatedAt: savedOrder.updatedAt,
  }
}

export async function updateOrder(
  paymentId: string,
  fields: Partial<Order>,
): Promise<Order | null> {
  const updated = await OrderModel.findOneAndUpdate({ paymentId }, fields, {
    new: true,
  }).lean()
  if (!updated) return null

  return {
    id: updated.id,
    paymentId: updated.paymentId,
    paymentIntentStatus: updated.paymentIntentStatus,
    orderStatus: updated.orderStatus,
    total: updated.total,
    currency: updated.currency,
    items: updated.items,
    firstName: updated.firstName,
    lastName: updated.lastName,
    email: updated.email,
    shipping: updated.shipping,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function getOrderByPaymentId(
  paymentId: string,
): Promise<Order | null> {
  const order = await OrderModel.findOne({ paymentId }).lean()
  if (!order) return null

  return {
    id: order.id,
    paymentId: order.paymentId,
    paymentIntentStatus: order.paymentIntentStatus,
    orderStatus: order.orderStatus,
    total: order.total,
    currency: order.currency,
    items: order.items,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    shipping: order.shipping,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

export async function getAllOrders(): Promise<Order[]> {
  const orders = await OrderModel.find().lean()
  return orders.map((order) => ({
    id: order.id,
    paymentId: order.paymentId,
    paymentIntentStatus: order.paymentIntentStatus,
    orderStatus: order.orderStatus,
    total: order.total,
    currency: order.currency,
    items: order.items,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    shipping: order.shipping,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }))
}

export async function deleteOrdersByIds(
  orderIds: number[],
): Promise<Order['id'][]> {
  await OrderModel.deleteMany({ id: { $in: orderIds } })

  return orderIds
}
