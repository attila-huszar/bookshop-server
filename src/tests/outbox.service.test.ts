import { beforeEach, describe, expect, it, jest } from 'bun:test'
import {
  publishPendingEmails,
  startOutboxRelay,
} from '@/services/outbox.service'
import type { EmailOutboxEntry } from '@/types'
import { mockEmailQueue, mockLogger, mockOutboxDB } from './test-setup'

const entry: EmailOutboxEntry = {
  id: 'order-confirmed-pi_test',
  payload: {
    type: 'verification',
    toAddress: 'guest@example.com',
    toName: 'Guest',
    tokenLink: 'https://example.com',
  },
  availableAt: new Date(),
  createdAt: new Date(),
  attempts: 1,
  leaseToken: 'lease',
  lockedUntil: null,
  processedAt: null,
  lastError: null,
  deliveryStatus: null,
  deliveryAttempts: 0,
  deliveryUpdatedAt: null,
  deliveryNextAttemptAt: null,
  deliveryError: null,
}

beforeEach(() => {
  Object.values(mockOutboxDB).forEach((fn) => fn.mockReset())
  mockEmailQueue.add.mockReset()
  mockLogger.info.mockReset()
  mockLogger.error.mockReset()
  mockOutboxDB.claimEmail.mockResolvedValueOnce(entry).mockResolvedValue(null)
  mockEmailQueue.add.mockResolvedValue({ id: entry.id })
})
describe('outbox relay', () => {
  it('continues polling during an outage without logging every retry', async () => {
    jest.useFakeTimers()
    mockOutboxDB.claimEmail.mockReset().mockRejectedValue(new Error('Offline'))
    const relay = startOutboxRelay()
    const settlePoll = async () => {
      // Drain publication and timer scheduling before advancing the next poll.
      for (let step = 0; step < 6; step++) {
        await Promise.resolve()
      }
    }

    try {
      await settlePoll()
      expect(mockLogger.error).toHaveBeenCalledTimes(1)

      for (let poll = 0; poll < 29; poll++) {
        jest.advanceTimersByTime(2000)
        await settlePoll()
      }

      expect(mockOutboxDB.claimEmail).toHaveBeenCalledTimes(30)
      expect(mockLogger.error).toHaveBeenCalledTimes(1)

      jest.advanceTimersByTime(2000)
      await settlePoll()
      expect(mockLogger.error).toHaveBeenCalledTimes(2)

      mockOutboxDB.claimEmail.mockResolvedValue(null)
      jest.advanceTimersByTime(2000)
      await settlePoll()
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Outbox relay polling recovered',
      )

      mockOutboxDB.claimEmail.mockRejectedValue(new Error('Offline again'))
      jest.advanceTimersByTime(2000)
      await settlePoll()
      expect(mockLogger.error).toHaveBeenCalledTimes(3)
    } finally {
      await relay.close()
      jest.useRealTimers()
    }
  })

  it('acknowledges only after Redis accepts the stable job ID', async () => {
    expect(
      await publishPendingEmails({
        repository: mockOutboxDB,
        queue: mockEmailQueue,
      }),
    ).toBe(1)
    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'verification',
      entry.payload,
      expect.objectContaining({
        jobId: entry.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      }),
    )
    expect(mockOutboxDB.completeEmail).toHaveBeenCalledWith(
      entry.id,
      expect.any(String),
    )
    expect(mockOutboxDB.retryEmail).not.toHaveBeenCalled()
  })
  it('retains an intent after a producer failure and schedules a bounded retry', async () => {
    mockEmailQueue.add.mockRejectedValueOnce(new Error('Redis unavailable'))
    expect(
      await publishPendingEmails({
        repository: mockOutboxDB,
        queue: mockEmailQueue,
      }),
    ).toBe(0)
    expect(mockOutboxDB.completeEmail).not.toHaveBeenCalled()
    expect(mockOutboxDB.retryEmail).toHaveBeenCalledWith(
      entry.id,
      expect.any(String),
      expect.any(Date),
      'Email publication failed',
    )
  })
  it('reuses the job ID after a crash window between publish and acknowledgement', async () => {
    mockOutboxDB.completeEmail.mockRejectedValueOnce(
      new Error('Database unavailable'),
    )
    await publishPendingEmails({
      repository: mockOutboxDB,
      queue: mockEmailQueue,
    })
    mockOutboxDB.claimEmail.mockResolvedValueOnce(entry)
    await publishPendingEmails({
      repository: mockOutboxDB,
      queue: mockEmailQueue,
    })
    expect(
      mockEmailQueue.add.mock.calls.map(
        (call) => (call[2] as { jobId: string } | undefined)?.jobId,
      ),
    ).toEqual([entry.id, entry.id])
  })
})
