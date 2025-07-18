import IORedis from 'ioredis'
import { Queue } from 'bullmq'
import { env } from '../config'
import { QUEUE } from '../constants'

const connection = new IORedis(env.redisUrl!, { maxRetriesPerRequest: null })

export const emailQueue = new Queue(QUEUE.EMAIL.NAME, { connection })
