import nodemailer from 'nodemailer'
import { env } from '@/config'
import { getEmailHtml } from '@/utils'
import { attachments, subjectMap, userMessage } from '@/constants'
import type { SendEmailProps } from '@/types'

const transportOptions = {
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: env.mailerUser,
    pass: env.mailerPass,
  },
}

const transporter = nodemailer.createTransport(transportOptions)

export async function sendEmail(props: SendEmailProps) {
  try {
    const mailOptions = {
      from: env.mailerUser,
      to: props.toAddress,
      subject: subjectMap[props.type],
      html: getEmailHtml(props),
      attachments,
    }

    return await transporter.sendMail(mailOptions)
  } catch (error) {
    throw new Error(userMessage.sendEmail, { cause: error })
  }
}
