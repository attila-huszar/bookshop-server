import mjml2html from 'mjml'
import { env } from '@/config'
import { log } from '@/libs'
import { cid } from '@/constants'
import orderConfirmation from '@/resources/emailTemplates/orderConfirmation.mjml' with { type: 'text' }
import passwordReset from '@/resources/emailTemplates/passwordReset.mjml' with { type: 'text' }
import verification from '@/resources/emailTemplates/verification.mjml' with { type: 'text' }
import type { SendEmailProps } from '@/types'

const baseLink = env.clientBaseUrl!

const interpolate = (template: string, vars: Record<string, string>) =>
  template.replace(/{{\s*(\w+)\s*}}/g, (_, key: string) => vars[key] ?? '')

const renderOrderItems = (
  items: {
    title: string
    quantity: number
    price: number
    discount?: number
  }[],
) =>
  items
    .map(({ title, quantity, price, discount }) => {
      const priceString = price.toFixed(2)
      const discountValue = discount ? (price * discount) / 100 : 0
      const discountString = discountValue ? `-${discountValue.toFixed(2)}` : ''
      const totalString = ((price - discountValue) * quantity).toFixed(2)
      return `<tr>
        <td>${title}</td>
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
          toName,
          orderNumber: order.paymentId.slice(-6).toUpperCase(),
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
            .filter(Boolean)
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
          toName,
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
          toName,
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
    default:
      throw new Error('Unknown email type')
  }
}
