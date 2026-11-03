import { Queue } from 'bullmq'
import { env } from '@/config'
import { getRedisConnectionHint } from '@/utils/redis.utils'
import { log } from '@/libs/logger'
import { emailQueueName, emailQueuePolicy } from '@/constants/email'

let redisConnectionErrorShown = false

export const emailQueue = new Queue(emailQueueName, {
  connection: {
    url: env.redisUrl,
    maxRetriesPerRequest: emailQueuePolicy.maxRetriesPerRequest,
    enableOfflineQueue: false,
    commandTimeout: emailQueuePolicy.commandTimeoutMs,
  },
})

emailQueue.on('error', (error) => {
  const hint = getRedisConnectionHint(error, env.redisUrl)

  if (hint) {
    if (redisConnectionErrorShown) {
      return
    }

    redisConnectionErrorShown = true

    log.warn('🚫 Redis is not reachable for email queue', { hint })

    return
  }

  redisConnectionErrorShown = false
  log.error('Email queue error', { error })
})
