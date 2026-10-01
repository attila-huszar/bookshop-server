import model from '@/models'
import { getErrorCode } from '@/utils/error.utils'
import type { Order, OrderInsert, OrderUpdate } from '@/types'

const { OrderModel } = model as MongoModel
const MONGO_DUPLICATE_KEY_CODE = 11000

export async function getOrderByCheckoutRequestId(
  checkoutRequestId: string,
): Promise<Order | null> {
  return await OrderModel.findOne({ checkoutRequestId }).lean().exec()
}

export async function createCheckoutOrder(
  order: OrderInsert,
): Promise<Order | null> {
  try {
    const { id, createdAt, updatedAt, ...orderData } = order
    const created = await OrderModel.create(orderData)
    return created.toObject()
  } catch (error) {
    // Concurrent requests can race to insert the same checkout. Only recover
    // a uniqueness conflict when the winning order actually exists.
    if (getErrorCode(error) === MONGO_DUPLICATE_KEY_CODE) {
      const existing = await getOrderByCheckoutRequestId(
        order.checkoutRequestId,
      )
      if (existing) return existing
    }
    throw error
  }
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

export async function updateOrderIfUnchanged(
  paymentId: string,
  expected: Pick<
    Order,
    'paymentStatus' | 'lastStripeEventCreated' | 'lastStripeEventId' | 'paidAt'
  >,
  fields: OrderUpdate,
): Promise<{ order: Order | null; becamePaid: boolean }> {
  const updatedOrder = await OrderModel.findOneAndUpdate(
    {
      paymentId,
      paymentStatus: expected.paymentStatus,
      lastStripeEventCreated: expected.lastStripeEventCreated,
      lastStripeEventId: expected.lastStripeEventId,
      paidAt: expected.paidAt,
    },
    fields,
    { new: true },
  )
    .lean()
    .exec()

  return {
    order: updatedOrder ?? null,
    becamePaid: Boolean(updatedOrder && fields.paidAt instanceof Date),
  }
}

export async function getOrder(paymentId: string): Promise<Order | null> {
  const order = await OrderModel.findOne({ paymentId }).lean().exec()
  if (!order) return null
  return order
}

export async function getOrderById(id: number): Promise<Order | null> {
  const order = await OrderModel.findOne({ id }).lean().exec()
  return order ?? null
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

  const linkedOrder = await OrderModel.findOneAndUpdate(
    { id: orderId, paymentId: null },
    { paymentId, paymentStatus },
    { new: true },
  )
    .lean()
    .exec()

  if (linkedOrder) return { order: linkedOrder, linked: true }

  const currentOrder = await getOrderById(orderId)
  return {
    order: currentOrder?.paymentId === paymentId ? currentOrder : null,
    linked: false,
  }
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

export async function deleteOrdersByIds(
  orderIds: number[],
): Promise<Order['id'][]> {
  await OrderModel.deleteMany({ id: { $in: orderIds } }).exec()
  return orderIds
}
