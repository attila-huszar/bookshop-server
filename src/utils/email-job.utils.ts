import { env } from '@/config'
import { EMAIL } from '@/constants/email'
import { reconciliationPolicy } from '@/constants/reconciliation'
import { AdminNotification } from '@/types/enums'
import type { Order } from '@/types/orders.types'
import type { EmailOutboxDraft } from '@/types/outbox.types'
import type { User } from '@/types/users.types'
import type {
  AccountEmailType,
  EmailInput,
  OrderEmailItem,
  SendEmailProps,
} from '@/types/worker.types'

function emailItems(items: Order['items']): OrderEmailItem[] {
  return items.map(({ title, quantity, price, discount }) => ({
    title,
    quantity,
    price,
    discount,
  }))
}

function emailIntentId(payload: SendEmailProps): string {
  if (
    payload.type === EMAIL.orderConfirmation.type &&
    payload.order.paymentId
  ) {
    return `order-confirmed-${payload.order.paymentId}`
  }

  if (payload.type === EMAIL.adminPaymentNotification.type) {
    switch (payload.notificationType) {
      case AdminNotification.New:
        return `admin-new-${payload.paymentId}`
      case AdminNotification.Error:
        return `admin-error-${payload.reconciliation?.alertId ?? crypto.randomUUID()}`
    }
  }

  return crypto.randomUUID()
}

/** Pure payload construction: no database, Redis, or SMTP operations. */
export function createEmailIntent(
  input: Exclude<EmailInput, { type: typeof EMAIL.orderConfirmation.type }>,
): EmailOutboxDraft
export function createEmailIntent(input: EmailInput): EmailOutboxDraft | null
export function createEmailIntent(input: EmailInput): EmailOutboxDraft | null {
  const { type, data } = input
  let payload: SendEmailProps

  switch (type) {
    case EMAIL.verification.type:
    case EMAIL.passwordReset.type:
      payload = { type, ...data }

      break
    case EMAIL.orderConfirmation.type: {
      const { order } = data

      if (!order.email) {
        return null
      }

      payload = {
        type,
        order: {
          paymentId: order.paymentId,
          total: order.total,
          currency: order.currency,
          shipping: order.shipping,
          items: emailItems(order.items),
        },
        toAddress: order.email,
        toName:
          [order.firstName?.trim(), order.lastName?.trim()].find(Boolean) ??
          'Valued Customer',
      }

      break
    }

    case EMAIL.adminPaymentNotification.type: {
      const { order, notificationType, reconciliation } = data

      const titles = {
        new: 'New order',
        error: 'Reconciliation failed',
      }

      const address = order.shipping?.address
      const shippingAddress = address
        ? [
            address.line1,
            address.line2,
            [address.city, address.state, address.postal_code]
              .filter(Boolean)
              .join(', '),
            address.country,
          ]
            .filter((part): part is string => Boolean(part))
            .map((part) => Bun.escapeHTML(part))
            .join('<br />')
        : 'Shipping address unavailable'

      payload = {
        type,
        notificationType,
        reconciliation,
        toAddress: env.adminEmail!,
        emailTitle: titles[notificationType],
        paymentId: order.paymentId,
        customerName:
          [order.firstName, order.lastName].filter(Boolean).join(' ') ||
          'Guest User',
        customerEmail: order.email ?? 'N/A',
        items: emailItems(order.items),
        total: order.total,
        currency: order.currency,
        paymentStatus: order.paymentStatus,
        shippingAddress,
      }

      break
    }
  }

  return {
    id: emailIntentId(payload),
    payload,
    availableAt: new Date(),
  }
}

export function accountEmailIntent(
  type: AccountEmailType,
  user: Pick<
    User,
    'email' | 'firstName' | 'verificationToken' | 'passwordResetToken'
  >,
): EmailOutboxDraft {
  const definition = EMAIL[type]
  const token = user[definition.tokenField]

  if (!token) {
    throw new Error(`Cannot create ${type} email without a token`)
  }

  return createEmailIntent({
    type,
    data: {
      toAddress: user.email,
      toName: user.firstName,
      tokenLink: `${env.clientBaseUrl}/${definition.path}?token=${encodeURIComponent(token)}`,
    },
  })
}

export function orderPaidEmails(order: Order): EmailOutboxDraft[] {
  const customer = createEmailIntent({
    type: EMAIL.orderConfirmation.type,
    data: { order },
  })
  const admin = createEmailIntent({
    type: EMAIL.adminPaymentNotification.type,
    data: { order, notificationType: AdminNotification.New },
  })

  return customer ? [customer, admin] : [admin]
}

/** The repository commits these failure fields and the optional email together. */
export function orderReconciliationFailure(order: Order, reason: string) {
  const failures = order.reconciliationFailures + 1
  const shouldAlert =
    !order.reconciliationAlertId &&
    failures >= reconciliationPolicy.failuresBeforeAlert
  const alertId =
    order.reconciliationAlertId ?? (shouldAlert ? crypto.randomUUID() : null)
  const email =
    shouldAlert && alertId
      ? createEmailIntent({
          type: EMAIL.adminPaymentNotification.type,
          data: {
            order,
            notificationType: AdminNotification.Error,
            reconciliation: {
              alertId,
              orderId: order.id,
              reason,
              failures,
              liveMode: !/^(sk|rk)_test_/.test(env.stripeSecret ?? ''),
            },
          },
        })
      : null

  return {
    fields: {
      reconciliationFailures: failures,
      reconciliationAlertId: alertId,
    },
    email,
  }
}
