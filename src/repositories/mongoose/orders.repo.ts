import model from '@/models'
import type { Order, OrderInsert, OrderUpdate } from '@/types'

const { OrderModel } = model as MongoModel

export async function createOrder(
  order: OrderInsert,
): Promise<OrderInsert | null> {
  const { id, createdAt, updatedAt, ...orderData } = order
  const created = await OrderModel.create(orderData)
  const orderObj = created.toObject()
  return orderObj
}

export async function updateOrder(
  paymentId: string,
  fields: OrderUpdate,
): Promise<Order | null> {
  const updatedOrder = await OrderModel.findOneAndUpdate(
    { paymentId },
    fields,
    { new: true },
  )
    .lean()
    .exec()
  if (!updatedOrder) return null
  return updatedOrder
}

export async function getOrder(paymentId: string): Promise<Order | null> {
  const order = await OrderModel.findOne({ paymentId }).lean().exec()
  if (!order) return null
  return order
}

export async function getAllOrders(): Promise<Order[]> {
  const orders = await OrderModel.find().lean().exec()
  return orders
}

export async function insertOrder(order: OrderInsert): Promise<Order> {
  const { id, createdAt, updatedAt, ...orderData } = order
  const created = await OrderModel.create(orderData)
  const orderObj = created.toObject()
  return orderObj
}

export async function deleteOrdersByIds(
  orderIds: number[],
): Promise<Order['id'][]> {
  await OrderModel.deleteMany({ id: { $in: orderIds } }).exec()
  return orderIds
}
