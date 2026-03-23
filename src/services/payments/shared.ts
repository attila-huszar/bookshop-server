import { Stripe } from 'stripe'
import { env } from '@/config'
import { ordersDB } from '@/repositories'
import { toIsoString } from '@/utils'
import { Unauthorized } from '@/errors'
import type { Order, PaymentSyncStatus } from '@/types'

export const stripe = new Stripe(env.stripeSecret!)

export type PaymentAccess = {
  paymentSessionId?: string
  userEmail?: string
}

export type OrderPersistSnapshot = Pick<
  Order,
  'paymentId' | 'items' | 'total' | 'currency' | 'paymentStatus'
> &
  Partial<Pick<Order, 'firstName' | 'lastName' | 'email' | 'shipping'>>

export async function authorizePaymentAccess(
  paymentId: string,
  access?: PaymentAccess,
): Promise<Order> {
  const order = await ordersDB.getOrder(paymentId)

  if (!order) {
    throw new Unauthorized('Unauthorized payment access')
  }

  const paymentSessionId = access?.paymentSessionId
  const userEmail = access?.userEmail
  const orderEmail = order.email

  if (paymentSessionId === paymentId) return order

  if (userEmail && orderEmail?.toLowerCase() === userEmail.toLowerCase()) {
    return order
  }

  throw new Unauthorized('Unauthorized payment access')
}

export function toOrderPersistSnapshot(
  order: Order,
  overrides: Partial<OrderPersistSnapshot> = {},
): OrderPersistSnapshot {
  return {
    paymentId: order.paymentId,
    paymentStatus: order.paymentStatus,
    items: order.items,
    total: order.total,
    currency: order.currency,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    shipping: order.shipping,
    ...overrides,
  }
}

export function toPaymentSyncStatus(order: Order): PaymentSyncStatus {
  return {
    paymentId: order.paymentId,
    paymentStatus: order.paymentStatus,
    amount: Math.round(order.total * 100),
    currency: order.currency,
    receiptEmail: order.email ?? null,
    shipping: order.shipping ?? null,
    finalizedAt: toIsoString(order.paidAt),
    webhookUpdatedAt: toIsoString(order.updatedAt),
  }
}
