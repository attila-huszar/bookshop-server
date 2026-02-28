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
  PasswordResetEmailProps,
  SendEmailInputMap,
  SendEmailProps,
  VerificationEmailProps,
} from '@/types'
import { getOrderRef } from './string.utils'

const baseLink = env.clientBaseUrl!

type SendEmailArgs = {
  [K in keyof SendEmailInputMap]: [type: K, data: SendEmailInputMap[K]]
}[keyof SendEmailInputMap]

export class SendEmailPreconditionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SendEmailPreconditionError'
  }
}

export function sendEmail(...args: SendEmailArgs): void {
  const [type, data] = args

  switch (type) {
    case QUEUE.EMAIL.JOB.VERIFICATION: {
      const payload: VerificationEmailProps = {
        type,
        ...data,
      }

      void emailQueue.add(type, payload, jobOpts).catch((error: Error) => {
        void log.error(
          '[QUEUE] Failed to queue registration verification email',
          {
            error,
            toAddress: payload.toAddress,
          },
        )
      })
      return
    }
    case QUEUE.EMAIL.JOB.PASSWORD_RESET: {
      const payload: PasswordResetEmailProps = {
        type,
        ...data,
      }

      void emailQueue.add(type, payload, jobOpts).catch((error: Error) => {
        void log.error('[QUEUE] Failed to queue password reset email', {
          error,
          toAddress: payload.toAddress,
        })
      })
      return
    }
    case QUEUE.EMAIL.JOB.ORDER_CONFIRMATION: {
      const { order, source } = data

      if (!order.email || !order.firstName) {
        void log.error(
          'Order missing email or first name for confirmation email',
          {
            paymentId: order.paymentId,
            source,
          },
        )
        throw new SendEmailPreconditionError(
          'Order confirmation email recipient data is missing',
        )
      }

      const payload: SendEmailProps = {
        type,
        toAddress: order.email,
        toName: order.firstName,
        order,
      }

      void emailQueue.add(type, payload, jobOpts).catch((error: Error) => {
        void log.error('[QUEUE] Order confirmation email queueing failed', {
          error,
          paymentId: order.paymentId,
          source,
        })
      })
      return
    }
    case QUEUE.EMAIL.JOB.ADMIN_PAYMENT_NOTIFICATION: {
      const { notificationType, order } = data

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

      const payload: AdminPaymentNotificationEmailProps = {
        type,
        notificationType,
        toAddress: env.adminEmail!,
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

      void emailQueue.add(type, payload, jobOpts).catch((error: Error) => {
        void log.error(
          '[QUEUE] Admin payment notification email queueing failed',
          {
            error,
            paymentId: order.paymentId,
            notificationType,
          },
        )
      })
      return
    }
    default: {
      const exhaustiveCheck: never = type
      return exhaustiveCheck
    }
  }
}

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
