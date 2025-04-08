import nodemailer from 'nodemailer'
import { env } from '../config'
import * as Errors from '../errors'

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
  toAddress: string
  toName: string
  tokenLink: string
  baseLink: string
  type: 'verification' | 'passwordReset'
}

export async function sendEmail({
  toAddress,
  toName,
  tokenLink,
  baseLink,
  type,
}: SendEmailProps) {
  const subject = {
    verification: 'Book Shop - Verify your email address',
    passwordReset: 'Book Shop - Forgotten Password',
  }[type]

  const text = {
    verification: `Hello ${toName},
      Please click ${tokenLink} to verify your email address.
      If the above link doesn't work, copy and paste it to your browser's address bar.
      These links are valid for 24 hours.
      Book Shop Team`,
    passwordReset: `Hello ${toName},
      Please click ${tokenLink} to reset your password.
      If the above link doesn't work, copy and paste it to your browser's address bar.
      These links are valid for 24 hours.
      Book Shop Team`,
  }[type]

  const html = {
    verification: `<p style="font-size: 14pt;">Hello <strong>${toName}</strong>,</p>
      <p style="font-size: 14pt; margin-bottom: 2rem;">Please verify your email address by clicking this <a href="${tokenLink}" target="_blank" rel="noopener"><strong>link</strong></a>.</p>
      <p>If the above link doesn't work, copy and paste this to your browser's address bar:</p>
      <p>${tokenLink}</p>
      <p style="margin-bottom: 2rem;"><em>These links are valid for 24 hours</em></p>
      <p style="font-size: 14pt;"><strong>Book Shop Team</strong></p>
      <p><a href="${baseLink}" target="_blank" rel="noopener"><img src="cid:194604053023767737" alt="logo" /></a></p>`,
    passwordReset: `<p style="font-size: 14pt;">Hello <strong>${toName}</strong>,</p>
      <p style="font-size: 14pt; margin-bottom: 2rem;">Please click this <a href="${tokenLink}" target="_blank" rel="noopener"><strong>link</strong></a> to reset your password.</p>
      <p>If the above link doesn't work, copy and paste this to your browser's address bar:</p>
      <p>${tokenLink}</p>
      <p style="margin-bottom: 2rem;"><em>These links are valid for 24 hours</em></p>
      <p style="font-size: 14pt;"><strong>Book Shop Team</strong></p>
      <p><a href="${baseLink}" target="_blank" rel="noopener"><img src="cid:194604053023767737" alt="logo" /></a></p>`,
  }[type]

  const mailOptions = {
    from: env.mailerUser,
    to: toAddress,
    subject,
    text,
    html,
    attachments: [
      {
        filename: 'bookshop-logo.png',
        path: process.cwd() + '/src/assets/images/bookshop-logo.png',
        contentType: 'image/png',
        cid: '194604053023767737',
      },
    ],
  }

  try {
    const mailSent = await transporter.sendMail(mailOptions)
    return mailSent
  } catch (error) {
    throw new Error(Errors.messages.sendEmail, { cause: error })
  }
}
