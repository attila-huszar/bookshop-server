import { outboxDB } from '@/repositories'
import { log } from '@/libs'
import { emailQueue } from '@/queues/emailQueue'
import { emailJobOptions } from '@/constants/email'

type Dependencies = {
  repository: typeof outboxDB
  queue: Pick<typeof emailQueue, 'add'>
}

/** At-least-once publication. Stable BullMQ IDs deduplicate relay retries. */
export async function publishPendingEmails(
  { repository, queue }: Dependencies = {
    repository: outboxDB,
    queue: emailQueue,
  },
): Promise<number> {
  let published = 0

  for (let count = 0; count < 50; count++) {
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
    } catch {
      // Provider errors may contain credentials; persist only a generic failure.
      const delay = Math.min(
        60 * 60_000,
        5000 * 2 ** Math.min(entry.attempts, 10),
      )

      await repository.retryEmail(
        entry.id,
        leaseToken,
        new Date(Date.now() + delay),
        'Email publication failed',
      )
      log.warn('Outbox publication will be retried', {
        id: entry.id,
        attempts: entry.attempts,
      })
      break
    }
  }

  return published
}

export function startOutboxRelay(): { close: () => Promise<void> } {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let running: Promise<void> = Promise.resolve()
  const tick = () => {
    running = publishPendingEmails()
      .then(
        () => undefined,
        () => {
          log.error('Outbox relay failed; retrying on the next poll')
        },
      )
      .finally(() => {
        if (!stopped) {
          timer = setTimeout(tick, 2000)
        }
      })
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
