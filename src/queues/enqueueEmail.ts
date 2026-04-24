import { env } from '@/config'
import { log } from '@/libs'
import { jobOpts, QUEUE } from '@/constants'
import { AdminNotification } from '@/types'
import type {
  AdminPaymentNotificationEmailProps,
  PasswordResetEmailProps,
  SendEmailInputMap,
  SendEmailProps,
  VerificationEmailProps,
} from '@/types'
import { emailQueue } from './emailQueue'

type SendEmailArgs = {
  [K in keyof SendEmailInputMap]: [type: K, data: SendEmailInputMap[K]]
}[keyof SendEmailInputMap]

export function enqueueEmail(...args: SendEmailArgs): void {
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
      const { order } = data

      if (!order.email || !order.firstName) {
        void log.warn(
          'Order missing email or first name for confirmation email',
          { paymentId: order.paymentId },
        )
        return
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
        })
      })
      return
    }
    case QUEUE.EMAIL.JOB.ADMIN_PAYMENT_NOTIFICATION: {
      const { notificationType, order } = data

      const emailTitleMap: Record<AdminNotification, string> = {
        [AdminNotification.Created]: 'Order Created',
        [AdminNotification.Confirmed]: 'Order Confirmed',
        [AdminNotification.Error]: 'Order Error',
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
