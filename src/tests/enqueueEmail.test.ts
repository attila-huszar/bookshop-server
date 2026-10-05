import { beforeEach, describe, expect, it } from 'bun:test'
import { rejects } from 'node:assert/strict'
import type { Order } from '@/types'
import { mockEmailQueue } from './test-setup'

const { enqueueEmail, flushQueuedEmails } =
  await import('@/queues/enqueueEmail')

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  checkoutRequestId: 'checkout-enqueue-test',
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'succeeded',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastReconciledAt: null,
  lastReconciliationAttemptAt: null,
  paidAt: new Date('2026-09-23T10:00:00.000Z'),
  total: 25.99,
  currency: 'USD',
  items: [],
  firstName: null,
  lastName: null,
  email: 'customer@example.com',
  shipping: null,
  createdAt: new Date('2026-09-23T09:55:00.000Z'),
  updatedAt: new Date('2026-09-23T10:00:00.000Z'),
  ...overrides,
})

describe('email enqueue shutdown', () => {
  it('waits for outstanding enqueues before resolving', async () => {
    let finish!: (value: { id: string }) => void
    mockEmailQueue.add.mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve
      }),
    )
    enqueueEmail('orderConfirmation', { order: createOrder() })
    let flushed = false
    const flush = flushQueuedEmails().then(() => {
      flushed = true
    })
    await Promise.resolve()
    expect(flushed).toBe(false)
    finish({ id: 'job_pending' })
    await flush
    expect(flushed).toBe(true)
  })

  it('reports enqueue failures even when they settle before shutdown', async () => {
    mockEmailQueue.add.mockRejectedValueOnce(new Error('Redis unavailable'))
    enqueueEmail('orderConfirmation', { order: createOrder() })
    await Promise.resolve()
    await rejects(flushQueuedEmails(), /Failed to enqueue 1 email/)
    await flushQueuedEmails()
  })
})

describe('enqueueEmail order confirmation', () => {
  beforeEach(() => {
    mockEmailQueue.add.mockClear()
    mockEmailQueue.add.mockResolvedValue({ id: 'job_1' })
  })

  it('queues confirmation with last name when first name is missing', () => {
    const order = createOrder({ lastName: 'Example' })

    enqueueEmail('orderConfirmation', { order })

    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'orderConfirmation',
      expect.objectContaining({
        toAddress: 'customer@example.com',
        toName: 'Example',
      }),
      expect.any(Object),
    )
  })

  it('uses a generic name when both customer names are missing', () => {
    enqueueEmail('orderConfirmation', { order: createOrder() })

    expect(mockEmailQueue.add).toHaveBeenCalledWith(
      'orderConfirmation',
      expect.objectContaining({ toName: 'Valued Customer' }),
      expect.any(Object),
    )
  })
})
