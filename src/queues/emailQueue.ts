import { Queue } from 'bullmq'
import { env } from '@/config'
import { getRedisConnectionHint } from '@/utils/redis.utils'
import { log } from '@/libs/logger'
import { QUEUE } from '@/constants'

let redisConnectionErrorShown = false

export const emailQueue = new Queue(QUEUE.EMAIL.NAME, {
  connection: {
    url: env.redisUrl,
    maxRetriesPerRequest: null,
  },
})

emailQueue.on('error', (error) => {
  const hintMeta = getRedisConnectionHint(error, env.redisUrl)

  if (hintMeta) {
    if (redisConnectionErrorShown) return
    redisConnectionErrorShown = true

    log.warn('🚫 Redis is not reachable for email queue', hintMeta)
    return
  }

  redisConnectionErrorShown = false
  log.error('Email queue error', { error })
})
