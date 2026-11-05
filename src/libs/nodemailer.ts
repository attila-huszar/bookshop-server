import nodemailer, {
  type SMTPPoolSentMessageInfo,
  type Transporter,
} from 'nodemailer'
import { env } from '@/config'
import { getEmailHtml, getEmailSubject } from '@/utils/emailTemplate.utils'
import {
  emailLogoContentId,
  emailLogoFilename,
  emailLogoFilePath,
  emailLogoMimeType,
  smtpPolicy,
} from '@/constants/email'
import type { SendEmailProps } from '@/types'
import { log } from './logger'

type MailTransporter = Transporter<SMTPPoolSentMessageInfo>

let transporter: MailTransporter | null = null
let smtpUnavailable = false

export function getTransporter(): MailTransporter | null {
  if (transporter) {
    return transporter
  }

  if (!env.mailerUser || !env.mailerPass) {
    return null
  }

  const {
    maxConnections,
    maxMessages,
    connectionTimeoutMs: connectionTimeout,
    greetingTimeoutMs: greetingTimeout,
    socketTimeoutMs: socketTimeout,
  } = smtpPolicy

  transporter = nodemailer.createTransport({
    pool: true,
    maxConnections,
    maxMessages,
    connectionTimeout,
    greetingTimeout,
    socketTimeout,

    service: env.mailerService,
    host: env.mailerHost,
    port: Number(env.mailerPort),
    secure: env.mailerSecure === 'true',

    auth: {
      user: env.mailerUser,
      pass: env.mailerPass,
    },
  })

  return transporter
}

export async function sendMail(
  props: SendEmailProps,
): Promise<SMTPPoolSentMessageInfo> {
  try {
    const activeTransporter = getTransporter()

    if (!activeTransporter) {
      throw new Error(
        'SMTP credentials are not configured (MAILER_USER / MAILER_PASS)',
      )
    }

    const result = await activeTransporter
      .sendMail({
        from: `${env.mailerName} <${env.mailerUser}>`,
        to: props.toAddress,
        subject: getEmailSubject(props),
        html: await getEmailHtml(props),
        attachments: [
          {
            filename: emailLogoFilename,
            path: emailLogoFilePath,
            contentType: emailLogoMimeType,
            cid: emailLogoContentId,
          },
        ],
      })
      .catch((error: unknown) => {
        if (transporter === activeTransporter) {
          smtpUnavailable = true
        }

        throw error
      })

    if (transporter === activeTransporter && smtpUnavailable) {
      smtpUnavailable = false
      log.info('✅ SMTP email delivery recovered')
    }

    return result
  } catch (error) {
    throw new Error(`Failed to send ${props.type} email`, { cause: error })
  }
}

export function closeMailer(): void {
  const activeTransporter = transporter

  transporter = null
  smtpUnavailable = false

  activeTransporter?.close()
}
