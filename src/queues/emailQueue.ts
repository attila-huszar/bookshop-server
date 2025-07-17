import IORedis from 'ioredis'
import { Queue } from 'bullmq'
import { env } from '../config'

const connection = new IORedis(env.redisUrl!, { maxRetriesPerRequest: null })

export const emailQueue = new Queue('email', { connection })
