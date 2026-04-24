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
): Promise<{ order: Order | null; becamePaid: boolean }> {
  const shouldAttemptPaidTransition = fields.paidAt instanceof Date

  if (!shouldAttemptPaidTransition) {
    const updatedOrder = await OrderModel.findOneAndUpdate(
      { paymentId },
      fields,
      { new: true },
    )
      .lean()
      .exec()

    return {
      order: updatedOrder ?? null,
      becamePaid: false,
    }
  }

  const paidTransitionOrder = await OrderModel.findOneAndUpdate(
    { paymentId, paidAt: null },
    fields,
    { new: true },
  )
    .lean()
    .exec()

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

  const updatedOrder = await OrderModel.findOneAndUpdate(
    { paymentId },
    fieldsWithoutPaidAt,
    { new: true },
  )
    .lean()
    .exec()

  return {
    order: updatedOrder ?? null,
    becamePaid: false,
  }
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

export async function getOrdersByEmail(email: string): Promise<Order[]> {
  const orders = await OrderModel.find({ email })
    .sort({ createdAt: -1 })
    .lean()
    .exec()

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
