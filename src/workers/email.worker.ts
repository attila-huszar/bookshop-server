import { type Job, Worker } from 'bullmq'
import { env } from '@/config'
import { getRedisConnectionHint } from '@/utils'
import { closeMailer, log, sendMail } from '@/libs'
import { concurrency, QUEUE, SHUTDOWN_SIGNALS } from '@/constants'
import type { SendEmailProps } from '@/types'

let shuttingDown = false
let redisHelpShown = false

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
  log.error('Email worker error', { error })
  logRedisStartupHint(error)
})

emailWorker.on('ready', () => {
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

function logRedisStartupHint(error: unknown): void {
  if (redisHelpShown) return

  const hintMeta = getRedisConnectionHint(error, env.redisUrl)
  if (!hintMeta) return

  redisHelpShown = true

  log.warn('Redis is not reachable for email worker', {
    ...hintMeta,
  })
}
