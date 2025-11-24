import type { Stripe } from 'stripe'
import model from '@/models'
import { defaultCurrency } from '@/constants'
import { type Order, type OrderCreate, OrderStatus } from '@/types'

const { OrderModel } = model as MongoModel

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
  }

  const created = await OrderModel.create(orderInsert)
  const savedOrder = created.toObject()

  return {
    id: savedOrder.id!,
    paymentId: savedOrder.paymentId,
    paymentIntentStatus:
      savedOrder.paymentIntentStatus as Stripe.PaymentIntent.Status,
    orderStatus: savedOrder.orderStatus as OrderStatus,
    total: savedOrder.total,
    currency: savedOrder.currency,
    items: savedOrder.items as Order['items'],
    firstName: savedOrder.firstName ?? null,
    lastName: savedOrder.lastName ?? null,
    email: savedOrder.email ?? null,
    phone: savedOrder.phone ?? null,
    address: savedOrder.address as Stripe.Address,
    createdAt: savedOrder.createdAt.toISOString(),
    updatedAt: savedOrder.updatedAt.toISOString(),
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
    id: updated.id!,
    paymentId: updated.paymentId,
    paymentIntentStatus:
      updated.paymentIntentStatus as Stripe.PaymentIntent.Status,
    orderStatus: updated.orderStatus as OrderStatus,
    total: updated.total,
    currency: updated.currency,
    items: updated.items as Order['items'],
    firstName: updated.firstName ?? null,
    lastName: updated.lastName ?? null,
    email: updated.email ?? null,
    phone: updated.phone ?? null,
    address: updated.address as Stripe.Address,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }
}

export async function getAllOrders(): Promise<Order[]> {
  const orders = await OrderModel.find().lean()
  return orders.map((order) => ({
    id: order.id!,
    paymentId: order.paymentId,
    paymentIntentStatus:
      order.paymentIntentStatus as Stripe.PaymentIntent.Status,
    orderStatus: order.orderStatus as OrderStatus,
    total: order.total,
    currency: order.currency,
    items: order.items as Order['items'],
    firstName: order.firstName ?? null,
    lastName: order.lastName ?? null,
    email: order.email ?? null,
    phone: order.phone ?? null,
    address: order.address as Stripe.Address,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  }))
}
