import type { Queue } from 'bullmq'
import type { outboxDB } from '@/repositories'
import { log } from '@/libs/logger'
import { emailJobOptions, outboxPolicy } from '@/constants/email'

type Dependencies = {
  repository: typeof outboxDB
  queue: Pick<Queue, 'add'>
}

/** At-least-once publication. Stable BullMQ IDs deduplicate relay retries. */
export async function publishPendingEmails(
  { repository, queue }: Dependencies,
  shouldStop: () => boolean = () => false,
): Promise<{ published: number; retryScheduled: boolean }> {
  let published = 0

  for (let count = 0; count < outboxPolicy.batchSize; count++) {
    if (shouldStop()) {
      break
    }

    const leaseToken = crypto.randomUUID()
    const entry = await repository.claimEmail(new Date(), leaseToken)

    if (!entry) {
      break
    }

    try {
      await queue.add(entry.payload.type, entry.payload, {
        ...emailJobOptions,
        jobId: entry.id,
      })
      await repository.completeEmail(entry.id, leaseToken)
      published++
    } catch (error) {
      // Provider errors may contain credentials; persist only a generic failure.
      const delay = Math.min(
        outboxPolicy.maxRetryMs,
        outboxPolicy.initialRetryMs *
          outboxPolicy.retryMultiplier **
            Math.min(entry.attempts, outboxPolicy.maxRetryExponent),
      )

      await repository.retryEmail(
        entry.id,
        leaseToken,
        new Date(Date.now() + delay),
        'Email publication failed',
      )
      log.warn('Outbox publication will be retried', {
        id: entry.id,
        type: entry.payload.type,
        attempts: entry.attempts,
        retryDelayMs: delay,
        error,
      })
      return { published, retryScheduled: true }
    }
  }

  return { published, retryScheduled: false }
}

export function startOutboxRelay(dependencies: Dependencies): {
  close: () => Promise<void>
} {
  let stopped = false
  let lastFailureLoggedAt: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> = Promise.resolve()

  function tick(): void {
    running = poll()
  }

  async function poll(): Promise<void> {
    try {
      const { retryScheduled } = await publishPendingEmails(
        dependencies,
        () => stopped,
      )

      if (!retryScheduled && lastFailureLoggedAt !== undefined) {
        log.info('✅ Outbox relay polling recovered')
        lastFailureLoggedAt = undefined
      }
    } catch (error) {
      const now = Date.now()

      if (
        lastFailureLoggedAt === undefined ||
        now >= lastFailureLoggedAt + outboxPolicy.failureLogMs
      ) {
        log.error('❌ Outbox relay failed; retrying on the next poll', {
          error,
          retryDelayMs: outboxPolicy.pollMs,
        })
        lastFailureLoggedAt = now
      }
    } finally {
      if (!stopped) {
        timer = setTimeout(tick, outboxPolicy.pollMs)
      }
    }
  }

  tick()

  return {
    close: async () => {
      stopped = true
      clearTimeout(timer)
      await running
    },
  }
}
