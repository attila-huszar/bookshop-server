import { beforeEach, describe, expect, it } from 'bun:test'
import { IssueCode, type Order } from '@/types'
import { mockEnqueueEmail, mockLogger } from './test-setup'

const { reportOrderSaveError } = await import('@/services/shared')

const baseOrderSnapshot: Pick<
  Order,
  | 'paymentId'
  | 'paymentStatus'
  | 'items'
  | 'total'
  | 'currency'
  | 'email'
  | 'shipping'
> = {
  paymentId: 'pi_test_123',
  paymentStatus: 'processing',
  items: [],
  total: 25.99,
  currency: 'USD',
  email: 'buyer@example.com',
  shipping: null,
}

describe('Persistence Utils', () => {
  beforeEach(() => {
    mockLogger.error.mockClear()
    mockEnqueueEmail.mockClear()
  })

  it('reports critical save failure and notifies admin by default', () => {
    reportOrderSaveError({
      issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
      message: '[CRITICAL] Webhook order update save failed',
      operation: 'update',
      paymentId: 'pi_test_123',
      saveFailureReason: 'threw',
      saveError: new Error('db write failed'),
      order: baseOrderSnapshot,
    })

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1)
  })

  it('supports report-only mode without admin notification', () => {
    reportOrderSaveError({
      issueCode: IssueCode.ORDER_SYNC_MARKER_SAVE_FAILED,
      operation: 'update',
      paymentId: 'pi_test_123',
      saveFailureReason: 'returned_null',
      order: baseOrderSnapshot,
      notifyAdmin: false,
    })

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    expect(mockEnqueueEmail).not.toHaveBeenCalled()
  })
})
