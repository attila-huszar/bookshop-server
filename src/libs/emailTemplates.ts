import mjml2html from 'mjml'
import verification from '../assets/emailTemplates/verification.mjml' with { type: 'text' }
import passwordReset from '../assets/emailTemplates/passwordReset.mjml' with { type: 'text' }
import orderConfirmation from '../assets/emailTemplates/orderConfirmation.mjml' with { type: 'text' }

function interpolate(template: string, vars: Record<string, string>) {
  return template.replace(
    /{{\s*(\w+)\s*}}/g,
    (_, key: string) => vars[key] ?? '',
  )
}

export function verificationEmail({
  toName,
  tokenLink,
  baseLink,
  logo,
}: {
  toName: string
  tokenLink: string
  baseLink: string
  logo: string
}) {
  const mjmlString = interpolate(verification, {
    toName,
    tokenLink,
    baseLink,
    logo,
  })

  return mjml2html(mjmlString)
}

export function passwordResetEmail({
  toName,
  tokenLink,
  baseLink,
  logo,
}: {
  toName: string
  tokenLink: string
  baseLink: string
  logo: string
}) {
  const mjmlString = interpolate(passwordReset, {
    toName,
    tokenLink,
    baseLink,
    logo,
  })

  return mjml2html(mjmlString)
}

function renderItems(
  items: {
    title: string
    quantity: number
    price: number
    discount?: number
  }[],
) {
  return items
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
}

export function orderConfirmationEmail({
  toName,
  orderNumber,
  items,
  total,
  currency,
  address,
}: {
  toName: string
  orderNumber: string
  items: {
    title: string
    quantity: number
    price: number
    discount?: number
  }[]
  total: number
  currency: string
  address: string
}) {
  const mjmlString = interpolate(orderConfirmation, {
    toName,
    orderNumber,
    eachItems: renderItems(items),
    total: total.toFixed(2),
    currency,
    address,
  })

  return mjml2html(mjmlString)
}
