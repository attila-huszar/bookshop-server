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
  log.info('Email sent successfully', {
    type: job.name,
    email: job.data.toAddress,
  })
})

emailWorker.on('failed', (job, error) => {
  log.error('Email sending failed', {
    type: job?.name,
    email: job?.data.toAddress,
    error,
  })
})

emailWorker.on('error', (error) => {
  const hintMeta = getRedisConnectionHint(error, env.redisUrl)

  if (hintMeta) {
    if (redisConnectionErrorShown) return
    redisConnectionErrorShown = true

    log.warn('🚫 Redis is not reachable for email worker', hintMeta)
    return
  }

  redisConnectionErrorShown = false
  log.error('Email worker error', { error })
})

emailWorker.on('ready', () => {
  redisConnectionErrorShown = false
  log.info('🟢 Email worker started', {
    queue: QUEUE.EMAIL.NAME,
    concurrency,
  })
})

export async function shutdownEmailWorker(
  signal: NodeJS.Signals,
): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  log.info('🟡 Email worker shutting down...', { signal })

  try {
    await emailWorker.close()
    closeMailer()
    log.info('🔴 Email worker closed', { signal })
    process.exit(0)
  } catch (error) {
    log.error('⚠️ Email worker shutdown failed', { signal, error })
    process.exit(1)
  }
}

if (import.meta.main) {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      log.info('Email worker received shutdown signal', { signal })
      void shutdownEmailWorker(signal)
    })
  }
}
