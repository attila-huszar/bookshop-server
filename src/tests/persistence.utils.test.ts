import { beforeEach, describe, expect, it } from 'bun:test'
import { Internal } from '@/errors'
import { IssueCode, type Order } from '@/types'
import { mockEnqueueEmail, mockLogger } from './test-setup'

const { reportCriticalOrderPersistFailure, throwCriticalOrderPersistFailure } =
  await import('@/services/shared')

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

  it('reports critical persistence failures with structured log context and admin notification', () => {
    reportCriticalOrderPersistFailure({
      issueCode: IssueCode.ORDER_SYNC_DRIFT_PERSIST_FAILED,
      message:
        '[CRITICAL] Stripe fallback detected status drift but DB update failed',
      operation: 'update',
      paymentId: 'pi_test_123',
      persistFailureReason: 'threw',
      persistError: new Error('db down'),
      dbStatus: 'processing',
      stripeStatus: 'succeeded',
      order: baseOrderSnapshot,
      additionalContext: {
        source: 'payments.retrieveOrderSyncStatus',
      },
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[CRITICAL] Stripe fallback detected status drift but DB update failed',
      expect.objectContaining({
        issueCode: IssueCode.ORDER_SYNC_DRIFT_PERSIST_FAILED,
        entity: 'order',
        operation: 'update',
        paymentId: 'pi_test_123',
        persistFailureReason: 'threw',
        dbStatus: 'processing',
        stripeStatus: 'succeeded',
        source: 'payments.retrieveOrderSyncStatus',
      }),
    )
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      'adminPaymentNotification',
      expect.objectContaining({
        notificationType: 'error',
        order: expect.objectContaining({
          paymentId: 'pi_test_123',
        }) as Order,
      }),
    )
  })

  it('supports log-only mode without admin notification', () => {
    reportCriticalOrderPersistFailure({
      issueCode: IssueCode.ORDER_SYNC_MARKER_PERSIST_FAILED,
      operation: 'update',
      paymentId: 'pi_test_123',
      persistFailureReason: 'returned_null',
      order: baseOrderSnapshot,
      notifyAdmin: false,
    })

    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    expect(mockEnqueueEmail).not.toHaveBeenCalled()
  })

  it('throws mapped Internal error after reporting critical failure', () => {
    let resultError: unknown = null

    try {
      throwCriticalOrderPersistFailure({
        issueCode: IssueCode.WEBHOOK_ORDER_PERSIST_FAILED,
        message: '[CRITICAL] Webhook order update persistence failed',
        throwMessage: 'Failed to persist webhook order update',
        errorName: 'InternalServerError',
        statusCode: 500,
        operation: 'update',
        paymentId: 'pi_test_123',
        persistFailureReason: 'threw',
        persistError: new Error('db write failed'),
        order: baseOrderSnapshot,
      })
    } catch (error) {
      resultError = error
    }

    expect(resultError).toBeInstanceOf(Internal)
    expect((resultError as Internal).status).toBe(500)
    expect((resultError as Internal).message).toBe(
      'Failed to persist webhook order update',
    )
    expect(mockLogger.error).toHaveBeenCalledTimes(1)
    expect(mockEnqueueEmail).toHaveBeenCalledTimes(1)
  })
})
