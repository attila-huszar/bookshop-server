import IORedis from 'ioredis'
import { Worker } from 'bullmq'
import { env } from '../config'
import { logger, sendEmail, type SendEmailProps } from '../libs'
import { concurrency, QUEUE } from '../constants'

const connection = new IORedis(env.redisUrl!, { maxRetriesPerRequest: null })

const emailWorker = new Worker(
  QUEUE.EMAIL.NAME,
  async (job: { data: SendEmailProps }) => await sendEmail(job.data),
  { connection, concurrency },
)

emailWorker.on('completed', (job) => {
  void logger.info('[WORKER] Email sent successfully', {
    id: job.id,
    name: job.name,
    email: job.data.toAddress,
  })
})

emailWorker.on('failed', (job, error) => {
  void logger.error('[WORKER] Email sending failed', {
    id: job?.id,
    name: job?.name,
    email: job?.data.toAddress,
    error,
  })
})
