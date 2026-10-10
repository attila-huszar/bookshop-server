import mjml2html from 'mjml'
import { env } from '@/config'
import { log } from '@/libs'
import { EMAIL, emailLogoContentId } from '@/constants'
import adminPaymentNotification from '@/resources/emailTemplates/adminPaymentNotification.mjml' with { type: 'text' }
import orderConfirmation from '@/resources/emailTemplates/orderConfirmation.mjml' with { type: 'text' }
import passwordReset from '@/resources/emailTemplates/passwordReset.mjml' with { type: 'text' }
import reconciliationFailure from '@/resources/emailTemplates/reconciliationFailure.mjml' with { type: 'text' }
import verification from '@/resources/emailTemplates/verification.mjml' with { type: 'text' }
import { AdminNotification } from '@/types'
import type {
  AdminPaymentNotificationEmailProps,
  OrderEmailItem,
  SendEmailProps,
} from '@/types'
import { getOrderRef } from './string.utils'

const baseLink = env.clientBaseUrl!

const interpolate = (template: string, vars: Record<string, string>) =>
  template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? '')

const renderOrderItems = (items: OrderEmailItem[]) =>
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

function renderReconciliationDetails(
  props: AdminPaymentNotificationEmailProps,
): string {
  const alert = props.reconciliation

  if (props.notificationType !== AdminNotification.Error || !alert) {
    return ''
  }

  const dashboardPath = props.paymentId
    ? `payments/${encodeURIComponent(props.paymentId)}`
    : 'payments'

  return interpolate(reconciliationFailure, {
    reason: Bun.escapeHTML(alert.reason),
    orderId: alert.orderId?.toString() ?? 'No matching local order',
    paymentReference: Bun.escapeHTML(props.paymentId ?? 'Not linked'),
    failures: alert.failures.toString(),
    dashboardUrl: `https://dashboard.stripe.com/${alert.liveMode ? '' : 'test/'}${dashboardPath}`,
  })
}

function emailTemplate(props: SendEmailProps): {
  template: string
  variables: Record<string, string>
} {
  switch (props.type) {
    case EMAIL.verification.type:
    case EMAIL.passwordReset.type:
      return {
        template:
          props.type === EMAIL.verification.type ? verification : passwordReset,
        variables: {
          toName: Bun.escapeHTML(props.toName),
          tokenLink: props.tokenLink,
        },
      }

    case EMAIL.orderConfirmation.type: {
      const { toName, order } = props

      return {
        template: orderConfirmation,
        variables: {
          toName: Bun.escapeHTML(toName),
          orderNumber: getOrderRef(order.paymentId ?? 'PENDING'),
          eachItems: renderOrderItems(order.items),
          total: order.total.toFixed(2),
          currency: order.currency,
          address: [
            order.shipping?.address?.line1,
            order.shipping?.address?.line2,
            order.shipping?.address?.city,
            order.shipping?.address?.state,
            order.shipping?.address?.postal_code,
            order.shipping?.address?.country,
          ]
            .filter((part): part is string => Boolean(part))
            .map((part) => Bun.escapeHTML(part))
            .join(', '),
        },
      }
    }

    case EMAIL.adminPaymentNotification.type:
      return {
        template: adminPaymentNotification,
        variables: {
          emailTitle: Bun.escapeHTML(props.emailTitle),
          paymentId: getOrderRef(props.paymentId ?? 'PENDING'),
          customerName: Bun.escapeHTML(props.customerName),
          customerEmail: Bun.escapeHTML(props.customerEmail),
          eachItems: renderOrderItems(props.items),
          total: props.total.toFixed(2),
          currency: props.currency,
          paymentStatus: props.paymentStatus,
          shippingAddress: props.shippingAddress,
          reconciliationDetails: renderReconciliationDetails(props),
        },
      }

    default:
      throw new Error('Unknown email type')
  }
}

export async function getEmailHtml(props: SendEmailProps): Promise<string> {
  try {
    const { template, variables } = emailTemplate(props)
    const mjmlString = interpolate(template, {
      ...variables,
      baseLink,
      cid: emailLogoContentId,
    })
    const parsed = await mjml2html(mjmlString)

    return parsed.html
  } catch (error) {
    log.error('Error generating email HTML', { type: props.type, error })

    throw error
  }
}

const adminPhaseLabelMap: Record<AdminNotification, string> = {
  [AdminNotification.New]: '🆕 NEW ORDER',
  [AdminNotification.Error]: '❌ RECONCILIATION FAILED',
}

export const getEmailSubject = (props: SendEmailProps): string => {
  switch (props.type) {
    case EMAIL.adminPaymentNotification.type:
      return `Order #${getOrderRef(props.paymentId ?? 'PENDING')} | ${adminPhaseLabelMap[props.notificationType]}`
    case EMAIL.verification.type:
    case EMAIL.passwordReset.type:
    case EMAIL.orderConfirmation.type:
      return EMAIL[props.type].subject
  }
}
