import model from '@/models'
import type { Order, OrderInsert, OrderUpdate } from '@/types'

const { OrderModel } = model as MongoModel

export async function createOrder(
  order: OrderInsert,
): Promise<OrderInsert | null> {
  const { id, createdAt, updatedAt, ...orderData } = order
  const created = await OrderModel.create(orderData)
  const orderObj = created.toObject()
  return {
    ...orderObj,
    createdAt: orderObj.createdAt.toISOString(),
    updatedAt: orderObj.updatedAt.toISOString(),
  }
}

export async function updateOrder(
  paymentId: string,
  fields: OrderUpdate,
): Promise<Order | null> {
  const updated = await OrderModel.findOneAndUpdate({ paymentId }, fields, {
    new: true,
  }).lean()
  if (!updated) return null
  return {
    ...updated,
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
    ...order,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }
}

export async function getAllOrders(): Promise<Order[]> {
  const orders = await OrderModel.find().lean()
  return orders.map((order) => ({
    ...order,
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
