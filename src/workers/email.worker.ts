import { type Job, Worker } from 'bullmq'
import { env } from '@/config'
import { log, sendMail } from '@/libs'
import { concurrency, QUEUE } from '@/constants'
import type { SendEmailProps } from '@/types'

const parsedUrl = new URL(env.redisUrl)
const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM']
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
  void log.info('Email sent successfully', {
    type: job.name,
    email: job.data.toAddress,
  })
})

emailWorker.on('failed', (job, error) => {
  void log.error('Email sending failed', {
    type: job?.name,
    email: job?.data.toAddress,
    error,
  })
})

emailWorker.on('error', (error) => {
  void log.error('Email worker error', { error })
})

export async function shutdownEmailWorker(
  signal: NodeJS.Signals,
): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true

  void log.info('Email worker shutting down', { signal })

  try {
    await emailWorker.close()
    void log.info('Email worker closed', { signal })
    process.exit(0)
  } catch (error) {
    void log.error('Email worker shutdown failed', { signal, error })
    process.exit(1)
  }
}

for (const signal of shutdownSignals) {
  process.once(signal, () => {
    void shutdownEmailWorker(signal)
  })
}
