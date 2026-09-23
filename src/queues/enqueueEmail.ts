import { env } from '@/config'
import { log } from '@/libs'
import { adminErrorAlertDelayMs, jobOpts, QUEUE } from '@/constants'
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

export function getAdminPaymentErrorJobId(paymentId: string): string {
  return `admin_alert_error-${paymentId}`
}

export async function cancelAdminPaymentErrorAlert(
  paymentId: string,
): Promise<boolean> {
  const jobId = getAdminPaymentErrorJobId(paymentId)
  const job = await emailQueue.getJob(jobId)

  if (!job) return false

  await job.remove()
  void log.info('[QUEUE] Canceled pending admin error alert', {
    jobId,
    paymentId,
  })
  return true
}

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

      if (!order.email) {
        void log.warn('Order missing email for confirmation email', {
          paymentId: order.paymentId,
        })
        return
      }

      const toName =
        [order.firstName?.trim(), order.lastName?.trim()].find(Boolean) ??
        'Valued Customer'

      const payload: SendEmailProps = {
        type,
        toAddress: order.email,
        toName,
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
      const { notificationType, order, source } = data

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
        source,
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

      const isErrorAlert = notificationType === AdminNotification.Error

      const alertJobOpts =
        isErrorAlert && order.paymentId
          ? {
              ...jobOpts,
              delay: adminErrorAlertDelayMs,
              jobId: getAdminPaymentErrorJobId(order.paymentId),
            }
          : jobOpts

      void emailQueue
        .add(type, payload, alertJobOpts)
        .then((job) => {
          void log.info('[QUEUE] Admin payment notification queued', {
            jobId: job.id,
            notificationType,
            source,
            paymentId: order.paymentId,
            paymentStatus: order.paymentStatus,
            ...(isErrorAlert && {
              delayed: true,
              delayMs: adminErrorAlertDelayMs,
            }),
          })
        })
        .catch((error: Error) => {
          void log.error(
            '[QUEUE] Admin payment notification email queueing failed',
            {
              error,
              paymentId: order.paymentId,
              notificationType,
              source,
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
