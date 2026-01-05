import { Worker } from 'bullmq'
import { env } from '@/config'
import { log, sendEmail } from '@/libs'
import { concurrency, QUEUE } from '@/constants'
import type { SendEmailProps } from '@/types'

const parsedUrl = new URL(env.redisUrl)

export const emailWorker = new Worker(
  QUEUE.EMAIL.NAME,
  async (job: { data: SendEmailProps }) => sendEmail(job.data),
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
  void log.info('[WORKER] Email sent successfully', {
    id: job.id,
    name: job.name,
    email: job.data.toAddress,
  })
})

emailWorker.on('failed', (job, error) => {
  void log.error('[WORKER] Email sending failed', {
    id: job?.id,
    name: job?.name,
    email: job?.data.toAddress,
    error,
  })
})

emailWorker.on('error', (error) => {
  void log.error('[WORKER] Email worker error', { error })
})
