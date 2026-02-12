import { env } from '@/config'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { jobOpts, QUEUE } from '@/constants'
import type {
  AdminPaymentNotificationEmailProps,
  Order,
  PaymentIntentShipping,
  PaymentIntentStatus,
} from '@/types'

type OrderForAdminEmail = {
  paymentId: string
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  items: Order['items']
  total: number
  currency: string
  paymentStatus: PaymentIntentStatus
  shipping?: PaymentIntentShipping | null
}

export const enum AdminNotificationType {
  Created = 'created',
  Confirmed = 'confirmed',
  Error = 'error',
}

type SendAdminNotificationEmailParams = {
  type: AdminNotificationType
  order: OrderForAdminEmail
}

export function sendAdminNotificationEmail({
  type,
  order,
}: SendAdminNotificationEmailParams): void {
  if (!env.adminEmail) {
    void log.warn('Admin email not configured, skipping notification', {
      paymentId: order.paymentId,
    })
    return
  }

  const emailTitle = {
    created: '🛍️ Order Created',
    confirmed: '✅ Order Confirmed',
    error: '⚠️ Order Error',
  }[type]

  const shippingMessage = {
    created: '⏳ Shipping address will be available after confirmation',
    confirmed: '🚫 Shipping address unavailable',
    error: '❌ Error during order processing',
  }[type]

  const shippingAddressParts = order.shipping
    ? [
        order.shipping.address?.line1,
        order.shipping.address?.line2,
        [
          order.shipping.address?.city,
          order.shipping.address?.state,
          order.shipping.address?.postal_code,
        ]
          .filter(Boolean)
          .join(', '),
        order.shipping.address?.country,
      ]
        .filter((part): part is string => Boolean(part))
        .map((part) => Bun.escapeHTML(part))
    : []

  const shippingAddress = shippingAddressParts.length
    ? shippingAddressParts.join('<br />')
    : shippingMessage

  const adminEmailData: AdminPaymentNotificationEmailProps = {
    type: QUEUE.EMAIL.JOB.ADMIN_PAYMENT_NOTIFICATION,
    toAddress: env.adminEmail,
    emailTitle,
    paymentId: order.paymentId,
    customerName:
      order.firstName && order.lastName
        ? `${order.firstName} ${order.lastName}`
        : (order.firstName ?? 'Guest User'),
    customerEmail: order.email ?? 'N/A',
    items: order.items.map((item) => ({
      title: item.title,
      quantity: item.quantity,
      price: item.price,
      discount: item.discount,
    })),
    total: order.total,
    currency: order.currency,
    paymentStatus: order.paymentStatus,
    shippingAddress,
  }

  void emailQueue
    .add(QUEUE.EMAIL.JOB.ADMIN_PAYMENT_NOTIFICATION, adminEmailData, jobOpts)
    .catch((error: Error) => {
      void log.error(
        '[QUEUE] Admin payment notification email queueing failed',
        { error, paymentId: order.paymentId },
      )
    })
}
