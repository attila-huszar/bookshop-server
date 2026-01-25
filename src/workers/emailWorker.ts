import { type Job, Worker } from 'bullmq'
import { env } from '@/config'
import { log, sendEmail } from '@/libs'
import { concurrency, QUEUE } from '@/constants'
import type { SendEmailProps } from '@/types'

const parsedUrl = new URL(env.redisUrl)

export const emailWorker = new Worker(
  QUEUE.EMAIL.NAME,
  async (job: Job<SendEmailProps>) => sendEmail(job.data),
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
