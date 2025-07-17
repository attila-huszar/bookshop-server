import IORedis from 'ioredis'
import { Worker } from 'bullmq'
import { env } from '../config'
import { logger, sendEmail, type SendEmailProps } from '../libs'

const connection = new IORedis(env.redisUrl!, { maxRetriesPerRequest: null })

new Worker(
  'email',
  async (job: { data: SendEmailProps }) => {
    try {
      await sendEmail(job.data)
    } catch (error) {
      void logger.error('[WORKER] Email sending failed', { error })
    }
  },
  { connection },
)
