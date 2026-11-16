import { type Job, Worker } from 'bullmq'
import { env } from '@/config'
import { ordersDB, outboxDB, usersDB } from '@/repositories'
import { monitorRedisRecovery } from '@/utils/redis.utils'
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

export function createEmailWorker() {
  const emailWorker = new Worker<SendEmailProps, EmailJobResult>(
    emailQueueName,
    processEmailJob,
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

    log.debug(
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
    const attempts = job?.attemptsMade
    const maxAttempts = job?.opts?.attempts ?? emailJobOptions.attempts
    const retrying =
      job !== undefined &&
      job.finishedOn == null &&
      (attempts ?? 0) < maxAttempts
    const meta = {
      jobId: job?.id,
      type: job?.name,
      attempts,
      maxAttempts,
      error,
    }

    if (retrying) {
      log.warn('Email delivery failed; retry scheduled', meta)
    } else {
      log.error('❌ Email delivery failed permanently', meta)
    }
  })

  const handleRedisError = monitorRedisRecovery({
    name: 'Email worker',
    backend: emailWorker.backend,
    redisUrl: env.redisUrl,
    isClosing: () => emailWorker.closing !== undefined,
  })

  emailWorker.on('error', (error) => {
    if (handleRedisError(error)) {
      return
    }

    log.error('Email worker error', { error })
  })

  emailWorker.on('ready', () => {
    log.debug('Email worker ready')
  })

  return emailWorker
}

async function processEmailJob(
  job: Job<SendEmailProps, EmailJobResult>,
): Promise<EmailJobResult> {
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
    const sent = await deliverEmail(job.data)
    result = { status: sent ? 'sent' : 'skipped' }
  } catch (error) {
    const retrying = attempts < (job.opts?.attempts ?? emailJobOptions.attempts)
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
}

async function deliverEmail(email: SendEmailProps): Promise<boolean> {
  if (
    email.type === EMAIL.verification.type ||
    email.type === EMAIL.passwordReset.type
  ) {
    const token = new URL(email.tokenLink).searchParams.get('token')

    // The queued link is a snapshot; a later request may replace its token.
    const user = await usersDB.getActiveUserBy('email', email.toAddress)
    const definition = EMAIL[email.type]
    const currentToken = user?.[definition.tokenField]
    const expiresAtMs = user?.[definition.expiresField]?.getTime() ?? 0

    const isAccountEmailObsolete =
      currentToken !== token || !(expiresAtMs > Date.now())

    if (isAccountEmailObsolete) {
      return false
    }
  }

  if (
    email.type === EMAIL.adminPaymentNotification.type &&
    email.notificationType === AdminNotification.Error
  ) {
    const order = email.reconciliation
      ? await ordersDB.getOrderById(email.reconciliation.orderId)
      : null

    const isReconciliationAlertObsolete =
      !email.reconciliation ||
      order?.reconciliationAlertId !== email.reconciliation.alertId

    if (isReconciliationAlertObsolete) {
      return false
    }
  }

  await sendMail(email)

  return true
}

async function recordOutcome(
  id: string,
  update: EmailDeliveryUpdate,
): Promise<void> {
  try {
    await outboxDB.updateEmailDelivery(id, update)
  } catch (error) {
    // A tracking outage must not retry an email already accepted by SMTP.
    log.error('❌ Could not record email delivery outcome', {
      jobId: id,
      status: update.status,
      error,
    })
  }
}
