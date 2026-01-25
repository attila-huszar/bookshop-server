import nodemailer, { type SendMailOptions } from 'nodemailer'
import { env } from '@/config'
import { getEmailHtml } from '@/utils'
import { attachments, subjectMap, userMessage } from '@/constants'
import type { SendEmailProps } from '@/types'
import { log } from './logger'

const transportOptions = {
  service: env.mailerService,
  host: env.mailerHost,
  port: Number(env.mailerPort),
  secure: env.mailerSecure === 'true' ? true : false,
  auth: {
    user: env.mailerUser!,
    pass: env.mailerPass!,
  },
}

const transporter = nodemailer.createTransport(transportOptions)

transporter
  .verify()
  .then(() => {
    log.info('SMTP transporter verified')
  })
  .catch((error: unknown) => {
    log.error('SMTP transporter verification failed', error)
  })

export async function sendEmail(props: SendEmailProps) {
  try {
    const mailOptions: SendMailOptions = {
      from: `${env.mailerName} <${env.mailerUser!}>`,
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
