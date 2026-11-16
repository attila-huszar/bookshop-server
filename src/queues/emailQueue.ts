import { Queue } from 'bullmq'
import { env } from '@/config'
import { monitorRedisRecovery } from '@/utils/redis.utils'
import { log } from '@/libs/logger'
import { emailQueueName, emailQueuePolicy } from '@/constants/email'

export function createEmailQueue() {
  const emailQueue = new Queue(emailQueueName, {
    connection: {
      url: env.redisUrl,
      maxRetriesPerRequest: emailQueuePolicy.maxRetriesPerRequest,
      enableOfflineQueue: false,
      commandTimeout: emailQueuePolicy.commandTimeoutMs,
    },
  })

  const handleRedisError = monitorRedisRecovery({
    name: 'Email queue',
    backend: emailQueue.backend,
    redisUrl: env.redisUrl,
    isClosing: () => emailQueue.closing !== undefined,
  })

  emailQueue.on('error', (error) => {
    if (handleRedisError(error)) {
      return
    }

    log.error('Email queue error', { error })
  })

  return emailQueue
}
