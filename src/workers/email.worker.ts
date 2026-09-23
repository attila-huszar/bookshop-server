import { type Job, Worker } from 'bullmq'
import { env } from '@/config'
import { getRedisConnectionHint } from '@/utils/redis.utils'
import { closeMailer, log, sendMail } from '@/libs'
import { concurrency, QUEUE, SHUTDOWN_SIGNALS } from '@/constants'
import type { SendEmailProps } from '@/types'

let shuttingDown = false
let redisConnectionErrorShown = false

export const emailWorker = new Worker(
  QUEUE.EMAIL.NAME,
  async (job: Job<SendEmailProps>) => sendMail(job.data),
  {
    connection: {
      url: env.redisUrl,
      maxRetriesPerRequest: null,
    },
    concurrency,
  },
)

emailWorker.on('completed', (job) => {
  const adminNotificationMeta =
    job.data.type === QUEUE.EMAIL.JOB.ADMIN_PAYMENT_NOTIFICATION
      ? {
          notificationType: job.data.notificationType,
          source: job.data.source,
          paymentId: job.data.paymentId,
          paymentStatus: job.data.paymentStatus,
        }
      : {}

  log.info('Email sent successfully', {
    jobId: job.id,
    type: job.name,
    ...adminNotificationMeta,
  })
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
    if (redisConnectionErrorShown) return
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
    queue: QUEUE.EMAIL.NAME,
    concurrency,
  })
})

export async function shutdownEmailWorker(
  signal: NodeJS.Signals,
): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  log.info('🛑 Email worker shutting down...', { signal })

  let hasShutdownError = false

  try {
    await emailWorker.close()
    log.info('✅ Email worker closed', { signal })
  } catch (error) {
    hasShutdownError = true
    log.error('❌ Email worker shutdown failed', { signal, error })
  }

  try {
    closeMailer()
  } catch (error) {
    hasShutdownError = true
    log.error('❌ Email transporter shutdown failed', { signal, error })
  }

  process.exit(hasShutdownError ? 1 : 0)
}

if (import.meta.main) {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      log.info('🛑 Email worker received shutdown signal', { signal })
      void shutdownEmailWorker(signal)
    })
  }
}
