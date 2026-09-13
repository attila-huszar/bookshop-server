import { beforeEach, describe, expect, it } from 'bun:test'
import { IssueCode, type Order, type PublicUser } from '@/types'
import { mockEnqueueEmail, mockLogger } from './test-setup'

const { reportOrderError } = await import('@/services/shared')
const { getPaymentIdempotencyKey } = await import('@/utils/payment.utils')

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

describe('Payment Utils', () => {
  beforeEach(() => {
    mockLogger.error.mockClear()
    mockEnqueueEmail.mockClear()
  })

  it('binds payment idempotency to the user and cart request', () => {
    const request = {
      items: [{ id: 1, quantity: 1 }],
      expectedTotal: 25.99,
    }
    const user = { uuid: 'user-1' } as PublicUser

    expect(getPaymentIdempotencyKey('client-key', request, user)).toBe(
      getPaymentIdempotencyKey('client-key', request, user),
    )
    expect(
      getPaymentIdempotencyKey(
        'client-key',
        { ...request, items: [{ id: 2, quantity: 1 }] },
        user,
      ),
    ).not.toBe(getPaymentIdempotencyKey('client-key', request, user))
    expect(
      getPaymentIdempotencyKey('client-key', request, {
        uuid: 'user-2',
      } as PublicUser),
    ).not.toBe(getPaymentIdempotencyKey('client-key', request, user))
  })

  it('reports critical save failure and notifies admin by default', () => {
    reportOrderError({
      issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
      message: '[CRITICAL] Webhook order update save failed',
      operation: 'update',
      paymentId: 'pi_test_123',
      saveFailureReason: 'threw',
      saveError: new Error('db write failed'),
      order: baseOrderSnapshot,
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[CRITICAL] Webhook order update save failed',
      expect.objectContaining({
        issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
        entity: 'order',
        operation: 'update',
        paymentId: 'pi_test_123',
        saveFailureReason: 'threw',
        error: expect.any(Error) as Error,
      }),
    )
    expect(mockEnqueueEmail).toHaveBeenCalledWith(
      'adminPaymentNotification',
      expect.objectContaining({
        notificationType: 'error',
        order: expect.objectContaining({
          paymentId: 'pi_test_123',
          paymentStatus: 'processing',
          total: 25.99,
          currency: 'USD',
          email: 'buyer@example.com',
          shipping: null,
          items: [],
        }) as Order,
      }),
    )
  })

  it('supports report-only mode without admin notification', () => {
    reportOrderError({
      issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
      operation: 'update',
      paymentId: 'pi_test_123',
      saveFailureReason: 'returned_null',
      order: baseOrderSnapshot,
      notifyAdmin: false,
    })

    expect(mockLogger.error).toHaveBeenCalledWith(
      '[CRITICAL] Order save failed',
      expect.objectContaining({
        issueCode: IssueCode.WEBHOOK_ORDER_SAVE_FAILED,
        entity: 'order',
        operation: 'update',
        paymentId: 'pi_test_123',
        saveFailureReason: 'returned_null',
      }),
    )
    expect(mockEnqueueEmail).not.toHaveBeenCalled()
  })
})
