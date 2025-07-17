import nodemailer from 'nodemailer'
import { env } from '../config'
import {
  verificationEmail,
  passwordResetEmail,
  orderConfirmationEmail,
} from './emailTemplates'
import { userMessage } from '../constants'
import type { Order } from '../types'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: env.mailerUser,
    pass: env.mailerPass,
  },
})

export type SendEmailProps =
  | {
      type: 'orderConfirmation'
      toAddress: string
      toName: string
      order: Order
    }
  | {
      type: 'verification' | 'passwordReset'
      toAddress: string
      toName: string
      tokenLink: string
    }

export async function sendEmail(props: SendEmailProps) {
  const baseLink = env.clientBaseUrl!
  const { type, toAddress, toName } = props

  const subject = {
    verification: 'Book Shop - Verify your email address',
    passwordReset: 'Book Shop - Forgotten Password',
    orderConfirmation: 'Book Shop - Order Confirmation',
  }[type]

  const logo = 'bookshop-logo-cid'

  const getHtml = () => {
    if (type === 'orderConfirmation') {
      const { order } = props
      return orderConfirmationEmail({
        toName: toName,
        orderNumber: order.paymentId.slice(-6).toUpperCase(),
        items: order.items.map(({ title, quantity, price, discount }) => ({
          title,
          quantity,
          price,
          discount,
        })),
        total: order.total,
        currency: order.currency,
        address: [
          order.address?.line1,
          order.address?.line2,
          order.address?.city,
          order.address?.state,
          order.address?.country,
        ]
          .filter(Boolean)
          .join(', '),
      }).html
    } else if (type === 'verification') {
      const { toName, tokenLink } = props
      return verificationEmail({ toName, tokenLink, baseLink, logo }).html
    } else if (type === 'passwordReset') {
      const { toName, tokenLink } = props
      return passwordResetEmail({ toName, tokenLink, baseLink, logo }).html
    } else {
      throw new Error('Invalid email type')
    }
  }

  const html = getHtml()

  const mailOptions = {
    from: env.mailerUser,
    to: toAddress,
    subject,
    html,
    attachments: [
      {
        filename: 'bookshop-logo.png',
        path: process.cwd() + '/src/assets/images/bookshop-logo.png',
        contentType: 'image/png',
        cid: logo,
      },
    ],
  }

  try {
    const mailSent = await transporter.sendMail(mailOptions)
    return mailSent
  } catch (error) {
    throw new Error(userMessage.sendEmail, { cause: error })
  }
}
