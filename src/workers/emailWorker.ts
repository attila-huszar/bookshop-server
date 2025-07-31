import IORedis from 'ioredis'
import { Worker } from 'bullmq'
import { env } from '@/config'
import { log, sendEmail } from '@/libs'
import { concurrency, QUEUE } from '@/constants'
import type { SendEmailProps } from '@/types'

const connection = new IORedis(env.redisUrl!, { maxRetriesPerRequest: null })

export const emailWorker = new Worker(
  QUEUE.EMAIL.NAME,
  async (job: { data: SendEmailProps }) => sendEmail(job.data),
  { connection, concurrency },
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
