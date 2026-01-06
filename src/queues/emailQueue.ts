import { Queue } from 'bullmq'
import { env } from '@/config'
import { QUEUE } from '@/constants'

const parsedUrl = new URL(env.redisUrl)

export const emailQueue = new Queue(QUEUE.EMAIL.NAME, {
  connection: {
    host: parsedUrl.hostname,
    port: Number(parsedUrl.port),
    maxRetriesPerRequest: null,
  },
})
