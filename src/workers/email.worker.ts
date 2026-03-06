import { type Job, Worker } from 'bullmq'
import { env } from '@/config'
import { log, sendMail } from '@/libs'
import { concurrency, QUEUE, SHUTDOWN_SIGNALS } from '@/constants'
import type { SendEmailProps } from '@/types'

const parsedUrl = new URL(env.redisUrl)
let shuttingDown = false

export const emailWorker = new Worker(
  QUEUE.EMAIL.NAME,
  async (job: Job<SendEmailProps>) => sendMail(job.data),
  {
    connection: {
      host: parsedUrl.hostname,
      port: Number(parsedUrl.port),
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
})

export async function shutdownEmailWorker(
  signal: NodeJS.Signals,
): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  log.info('Email worker shutting down', { signal })

  try {
    await emailWorker.close()
    log.info('Email worker closed', { signal })
    process.exit(0)
  } catch (error) {
    log.error('Email worker shutdown failed', { signal, error })
    process.exit(1)
  }
}

for (const signal of SHUTDOWN_SIGNALS) {
  process.once(signal, () => {
    void shutdownEmailWorker(signal)
  })
}
