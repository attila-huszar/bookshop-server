import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer'
import type SMTPPool from 'nodemailer/lib/smtp-pool'
import { env } from '@/config'
import { getEmailHtml, getEmailSubject } from '@/utils'
import {
  emailLogoContentId,
  emailLogoFilename,
  emailLogoFilePath,
  emailLogoMimeType,
  userMessage,
} from '@/constants'
import type { SendEmailProps } from '@/types'
import { log } from './logger'

type MailTransporter = Transporter<SMTPPool.SentMessageInfo, SMTPPool.Options>
type SentMessageInfo = SMTPPool.SentMessageInfo

let transporter: MailTransporter | null = null

function createTransporter(): MailTransporter {
  return nodemailer.createTransport({
    pool: true,
    maxConnections: 5,
    maxMessages: 100,

    service: env.mailerService,
    host: env.mailerHost,
    port: Number(env.mailerPort),
    secure: env.mailerSecure === 'true',

    auth: {
      user: env.mailerUser,
      pass: env.mailerPass,
    },
  })
}

export function getTransporter(): MailTransporter | null {
  if (transporter) return transporter

  if (!env.mailerUser || !env.mailerPass) {
    return null
  }

  transporter = createTransporter()

  transporter
    .verify()
    .then(() => {
      log.info('📧 SMTP transporter verified')
    })
    .catch((error: unknown) => {
      log.error('❌ SMTP transporter verification failed', error)
    })

  transporter.on('idle', () => log.info('📧 SMTP pool ready'))

  return transporter
}

export function initMailer(): void {
  getTransporter()
}

export function closeMailer(): void {
  const activeTransporter = transporter
  transporter = null

  if (!activeTransporter) return

  activeTransporter.close()
}

export async function sendMail(
  props: SendEmailProps,
): Promise<SentMessageInfo> {
  try {
    if (!env.mailerUser || !env.mailerPass) {
      throw new Error(
        '🚫 Mailer is not configured in .env (MAILER_USER / MAILER_PASS missing)',
      )
    }

    const transporter = getTransporter()

    if (!transporter) {
      throw new Error('❌ SMTP transporter unavailable')
    }

    const attachments: SendMailOptions['attachments'] = [
      {
        filename: emailLogoFilename,
        path: emailLogoFilePath,
        contentType: emailLogoMimeType,
        cid: emailLogoContentId,
      },
    ]

    const mailOptions: SendMailOptions = {
      from: `${env.mailerName} <${env.mailerUser}>`,
      to: props.toAddress,
      subject: getEmailSubject(props),
      html: getEmailHtml(props),
      attachments,
    }

    return await transporter.sendMail(mailOptions)
  } catch (error) {
    throw new Error(userMessage.emailSendFailed, { cause: error })
  }
}
