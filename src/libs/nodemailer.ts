import nodemailer from 'nodemailer'
import { env } from '../config'
import { verificationEmail, passwordResetEmail } from './emailTemplates'
import { userMessage } from '../constants'

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

type SendEmailProps = {
  type: 'verification' | 'passwordReset'
  toAddress: string
  toName: string
  tokenLink: string
  baseLink: string
  logo: string
}

export async function sendEmail({
  type,
  toAddress,
  toName,
  tokenLink,
  baseLink,
  logo = 'bookshop-logo-cid',
}: SendEmailProps) {
  const subject = {
    verification: 'Book Shop - Verify your email address',
    passwordReset: 'Book Shop - Forgotten Password',
  }[type]

  const html = {
    verification: verificationEmail({ toName, tokenLink, baseLink, logo }).html,
    passwordReset: passwordResetEmail({ toName, tokenLink, baseLink, logo })
      .html,
  }[type]

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
