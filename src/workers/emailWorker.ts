import IORedis from 'ioredis'
import { Worker } from 'bullmq'
import { env } from '../config'
import { logWorker, sendEmail } from '../libs'
import { concurrency, QUEUE } from '../constants'
import type { SendEmailProps } from '../types'

const connection = new IORedis(env.redisUrl!, { maxRetriesPerRequest: null })

export const emailWorker = new Worker(
  QUEUE.EMAIL.NAME,
  async (job: { data: SendEmailProps }) => await sendEmail(job.data),
  { connection, concurrency },
)

emailWorker.on('completed', (job) => {
  void logWorker.info('Email sent successfully', {
    id: job.id,
    name: job.name,
    email: job.data.toAddress,
  })
})

emailWorker.on('failed', (job, error) => {
  void logWorker.error('Email sending failed', {
    id: job?.id,
    name: job?.name,
    email: job?.data.toAddress,
    error,
  })
})

emailWorker.on('error', (error) => {
  void logWorker.error('Email worker error', { error })
})
