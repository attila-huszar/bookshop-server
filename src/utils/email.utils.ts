import mjml2html from 'mjml'
import { env } from '@/config'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { cid, jobOpts, QUEUE } from '@/constants'
import adminPaymentNotification from '@/resources/emailTemplates/adminPaymentNotification.mjml' with { type: 'text' }
import orderConfirmation from '@/resources/emailTemplates/orderConfirmation.mjml' with { type: 'text' }
import passwordReset from '@/resources/emailTemplates/passwordReset.mjml' with { type: 'text' }
import verification from '@/resources/emailTemplates/verification.mjml' with { type: 'text' }
import { AdminNotification } from '@/types'
import type {
  AdminPaymentNotificationEmailItem,
  AdminPaymentNotificationEmailProps,
  Order,
  SendEmailProps,
} from '@/types'
import { getOrderRef } from './string.utils'

const baseLink = env.clientBaseUrl!

const interpolate = (template: string, vars: Record<string, string>) =>
  template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? '')

const renderOrderItems = (items: AdminPaymentNotificationEmailItem[]) =>
  items
    .map(({ title, quantity, price, discount }) => {
      const priceString = price.toFixed(2)
      const discountValue = discount ? (price * discount) / 100 : 0
      const discountString = discountValue ? `-${discountValue.toFixed(2)}` : ''
      const totalString = ((price - discountValue) * quantity).toFixed(2)
      return `<tr>
        <td>${Bun.escapeHTML(title)}</td>
        <td align="center">${priceString}</td>
        <td align="center">${discountString}</td>
        <td align="center">${quantity}</td>
        <td align="right">${totalString}</td>
        </tr>`
    })
    .join('')

export function getEmailHtml(props: SendEmailProps): string {
  switch (props.type) {
    case 'orderConfirmation': {
      try {
        const { toName, order } = props
        const mjmlString = interpolate(orderConfirmation, {
          toName: Bun.escapeHTML(toName),
          orderNumber: getOrderRef(order.paymentId),
          eachItems: renderOrderItems(order.items),
          total: order.total.toFixed(2),
          currency: order.currency,
          address: [
            order.shipping?.address?.line1,
            order.shipping?.address?.line2,
            order.shipping?.address?.city,
            order.shipping?.address?.state,
            order.shipping?.address?.country,
          ]
            .filter((part): part is string => Boolean(part))
            .map((part) => Bun.escapeHTML(part))
            .join(', '),
          baseLink,
          cid,
        })
        return mjml2html(mjmlString).html
      } catch (error) {
        log.error('Error generating order confirmation email HTML', { error })
        throw error
      }
    }
    case 'verification': {
      try {
        const { toName, tokenLink } = props
        const mjmlString = interpolate(verification, {
          toName: Bun.escapeHTML(toName),
          tokenLink,
          baseLink,
          cid,
        })
        return mjml2html(mjmlString).html
      } catch (error) {
        log.error('Error generating verification email HTML', { error })
        throw error
      }
    }
    case 'passwordReset': {
      try {
        const { toName, tokenLink } = props
        const mjmlString = interpolate(passwordReset, {
          toName: Bun.escapeHTML(toName),
          tokenLink,
          baseLink,
          cid,
        })
        return mjml2html(mjmlString).html
      } catch (error) {
        log.error('Error generating password reset email HTML', { error })
        throw error
      }
    }
    case 'adminPaymentNotification': {
      try {
        const {
          emailTitle,
          paymentId,
          customerName,
          customerEmail,
          items,
          total,
          currency,
          paymentStatus,
          shippingAddress,
        } = props
        const mjmlString = interpolate(adminPaymentNotification, {
          emailTitle: Bun.escapeHTML(emailTitle),
          paymentId: getOrderRef(paymentId),
          customerName: Bun.escapeHTML(customerName),
          customerEmail: Bun.escapeHTML(customerEmail),
          eachItems: renderOrderItems(items),
          total: total.toFixed(2),
          currency,
          paymentStatus,
          shippingAddress,
          baseLink,
          cid,
        })
        return mjml2html(mjmlString).html
      } catch (error) {
        log.error('Error generating admin payment notification email HTML', {
          error,
        })
        throw error
      }
    }
    default:
      throw new Error('Unknown email type')
  }
}

type OrderForAdminEmail = Pick<
  Order,
  'paymentId' | 'items' | 'total' | 'currency' | 'paymentStatus'
> &
  Partial<Pick<Order, 'firstName' | 'lastName' | 'email' | 'shipping'>>

type SendAdminNotificationEmailParams = {
  notificationType: AdminNotification
  order: OrderForAdminEmail
}

export function sendAdminNotificationEmail({
  notificationType,
  order,
}: SendAdminNotificationEmailParams): void {
  if (!env.adminEmail) {
    void log.warn('Admin email not configured, skipping notification', {
      paymentId: order.paymentId,
    })
    return
  }

  const emailTitleMap: Record<AdminNotification, string> = {
    [AdminNotification.Created]: '🛍️ Order Created',
    [AdminNotification.Confirmed]: '✅ Order Confirmed',
    [AdminNotification.Error]: '⚠️ Order Error',
  }
  const shippingMessageMap: Record<AdminNotification, string> = {
    [AdminNotification.Created]:
      '⏳ Shipping address will be available after confirmation',
    [AdminNotification.Confirmed]: '🚫 Shipping address unavailable',
    [AdminNotification.Error]: '❌ Error during order processing',
  }
  const emailTitle = emailTitleMap[notificationType]
  const shippingMessage = shippingMessageMap[notificationType]

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
    notificationType,
    toAddress: env.adminEmail,
    emailTitle,
    paymentId: order.paymentId,
    customerName:
      order.firstName && order.lastName
        ? `${order.firstName} ${order.lastName}`
        : (order.firstName ?? 'Guest User'),
    customerEmail: order.email ?? 'N/A',
    items: order.items,
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
