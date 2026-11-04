import { type Job, Worker } from 'bullmq'
import { env } from '@/config'
import { ordersDB, outboxDB, usersDB } from '@/repositories'
import { getRedisConnectionHint } from '@/utils/redis.utils'
import { log } from '@/libs/logger'
import { sendMail } from '@/libs/nodemailer'
import {
  EMAIL,
  emailJobOptions,
  emailQueueName,
  emailWorkerConcurrency,
} from '@/constants/email'
import {
  AdminNotification,
  type EmailDeliveryUpdate,
  type SendEmailProps,
} from '@/types'

type EmailJobResult = { status: 'sent' | 'skipped' }

async function deliverEmail(email: SendEmailProps): Promise<EmailJobResult> {
  if (
    email.type === EMAIL.verification.type ||
    email.type === EMAIL.passwordReset.type
  ) {
    const token = URL.canParse(email.tokenLink)
      ? new URL(email.tokenLink).searchParams.get('token')
      : null

    if (!token) {
      return { status: 'skipped' }
    }

    // The queued link is a snapshot; a later request may replace its token.
    const user = await usersDB.getActiveUserBy('email', email.toAddress)
    const definition = EMAIL[email.type]
    const currentToken = user?.[definition.tokenField]
    const expiresAt = user?.[definition.expiresField]

    if (
      !user ||
      (definition.skipIfVerified && user.verified) ||
      currentToken !== token ||
      !expiresAt ||
      !(new Date(expiresAt).getTime() > Date.now())
    ) {
      return { status: 'skipped' }
    }
  }

  if (
    email.type === EMAIL.adminPaymentNotification.type &&
    email.notificationType === AdminNotification.Error
  ) {
    const order = email.reconciliation
      ? await ordersDB.getOrderById(email.reconciliation.orderId)
      : null

    if (
      !email.reconciliation ||
      order?.reconciliationAlertId !== email.reconciliation.alertId
    ) {
      return { status: 'skipped' }
    }
  }

  await sendMail(email)

  return { status: 'sent' }
}

async function recordOutcome(
  id: string,
  update: EmailDeliveryUpdate,
): Promise<void> {
  try {
    await outboxDB.updateEmailDelivery(id, update)
  } catch (error) {
    // A tracking outage must not retry an email already accepted by SMTP.
    log.error('Could not record email delivery outcome', {
      jobId: id,
      status: update.status,
      error,
    })
  }
}

export function createEmailWorker() {
  let redisConnectionErrorShown = false
  const emailWorker = new Worker<SendEmailProps, EmailJobResult>(
    emailQueueName,
    async (
      job: Job<SendEmailProps, EmailJobResult>,
    ): Promise<EmailJobResult> => {
      if (!job.id) {
        throw new Error('Email job ID is required')
      }

      const attempts = (job.attemptsMade ?? 0) + 1
      let result: EmailJobResult

      try {
        await outboxDB.updateEmailDelivery(job.id, {
          status: 'sending',
          attempts,
          nextAttemptAt: null,
          error: null,
        })
        result = await deliverEmail(job.data)
      } catch (error) {
        const retrying =
          attempts < (job.opts?.attempts ?? emailJobOptions.attempts)
        // Estimated eligibility time; BullMQ owns actual retry scheduling.
        const retryDelay = emailJobOptions.backoff.delay * 2 ** (attempts - 1)

        await recordOutcome(job.id, {
          status: retrying ? 'retrying' : 'failed',
          attempts,
          nextAttemptAt: retrying ? new Date(Date.now() + retryDelay) : null,
          error: 'Email delivery failed',
        })

        throw error
      }

      await recordOutcome(job.id, {
        status: result.status,
        attempts,
        nextAttemptAt: null,
        error: null,
      })

      return result
    },
    {
      connection: {
        url: env.redisUrl,
        maxRetriesPerRequest: null,
      },
      concurrency: emailWorkerConcurrency,
      autorun: false,
    },
  )

  emailWorker.on('completed', (job, result) => {
    const adminNotificationMeta =
      job.data.type === EMAIL.adminPaymentNotification.type
        ? {
            notificationType: job.data.notificationType,
            paymentId: job.data.paymentId,
            paymentStatus: job.data.paymentStatus,
          }
        : {}

    log.info(
      result.status === 'skipped'
        ? 'Obsolete email skipped'
        : 'Email sent successfully',
      {
        jobId: job.id,
        type: job.name,
        ...adminNotificationMeta,
      },
    )
  })

  emailWorker.on('failed', (job, error) => {
    log.error('Email sending failed', {
      jobId: job?.id,
      type: job?.name,
      error,
    })
  })

  emailWorker.on('error', (error) => {
    const hint = getRedisConnectionHint(error, env.redisUrl)

    if (hint) {
      if (redisConnectionErrorShown) {
        return
      }

      redisConnectionErrorShown = true

      log.warn('⚠️ Redis is not reachable for email worker', { hint })

      return
    }

    redisConnectionErrorShown = false
    log.error('Email worker error', { error })
  })

  emailWorker.on('ready', () => {
    redisConnectionErrorShown = false
    log.info('✅ Email worker ready', {
      queue: emailQueueName,
      concurrency: emailWorkerConcurrency,
    })
  })

  return emailWorker
}
