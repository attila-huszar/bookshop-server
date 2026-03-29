import { beforeEach, describe, expect, it } from 'bun:test'
import { BadRequest } from '@/errors/BadRequest'
import { Internal } from '@/errors/Internal'
import { ServiceUnavailable } from '@/errors/ServiceUnavailable'
import { Unauthorized } from '@/errors/Unauthorized'
import { IssueCode, type Order } from '@/types'
import {
  mockBooksDB,
  mockEnqueueEmail,
  mockLogger,
  mockOrdersDB,
  mockStripe,
  mockValidate,
} from './test-setup'

const {
  cancelPaymentIntent,
  createPaymentIntent,
  retrieveOrderSyncStatus,
  retrievePaymentIntent,
} = await import('@/services/payments')

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'processing',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastStripeSyncCheckedAt: null,
  paidAt: null,
  total: 12.34,
  currency: 'USD',
  items: [],
  firstName: 'Guest',
  lastName: 'User',
  email: 'guest@example.com',
  shipping: null,
  createdAt: new Date('2026-02-24T10:00:00.000Z'),
  updatedAt: new Date('2026-02-24T10:05:00.000Z'),
  ...overrides,
})

const hasStringIdempotencyKey = (
  value: unknown,
): value is { idempotencyKey: string } =>
  typeof value === 'object' &&
  value !== null &&
  'idempotencyKey' in value &&
  typeof (value as { idempotencyKey?: unknown }).idempotencyKey === 'string'

describe('Payments Service', () => {
  beforeEach(() => {
    mockValidate.mockReset()
    mockBooksDB.getBookById.mockReset()
    mockOrdersDB.getOrder.mockReset()
    mockOrdersDB.createOrder.mockReset()
    mockOrdersDB.updateOrder.mockReset()
    mockStripe.paymentIntents.create.mockReset()
    mockStripe.paymentIntents.retrieve.mockReset()
    mockStripe.paymentIntents.cancel.mockReset()
    mockEnqueueEmail.mockReset()
    mockLogger.error.mockReset()

    mockValidate.mockReturnValue('pi_test_123')
  })

  describe('retrievePaymentIntent', () => {
    it('rejects unauthorized access before Stripe retrieval', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(createOrder())

      let resultError: unknown = null

      try {
        await retrievePaymentIntent('pi_test_123', {
          userEmail: 'other@example.com',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Unauthorized)
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    })

    it('rejects when order does not exist', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(null)

      let resultError: unknown = null

      try {
        await retrievePaymentIntent('pi_test_123', {
          paymentSessionId: 'pi_test_123',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Unauthorized)
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    })
  })

  describe('createPaymentIntent', () => {
    it('uses Stripe payment intent status in admin notification when order creation fails', async () => {
      mockValidate
        .mockReturnValueOnce({
          items: [{ id: 1, quantity: 1 }],
          expectedTotal: 12.34,
        })
        .mockReturnValueOnce({})
      mockBooksDB.getBookById.mockResolvedValueOnce({
        id: 1,
        title: 'Sample Book',
        author: 'Sample Author',
        imgUrl: '',
        price: 12.34,
        discount: 0,
      })
      mockStripe.paymentIntents.create.mockResolvedValueOnce({
        id: 'pi_test_123',
        status: 'processing',
        client_secret: 'pi_test_secret',
      })
      mockOrdersDB.createOrder.mockResolvedValueOnce(null)

      let resultError: unknown = null

      try {
        await createPaymentIntent(
          {
            items: [{ id: 1, quantity: 1 }],
            expectedTotal: 12.34,
          },
          null,
          'req_test_123',
        )
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Internal)
      expect((resultError as Error).message).toBe(
        'Failed to create order in database',
      )
      expect(mockEnqueueEmail).toHaveBeenCalledWith(
        'adminPaymentNotification',
        {
          notificationType: 'error',
          order: expect.objectContaining({
            paymentId: 'pi_test_123',
            paymentStatus: 'processing',
          }) as Order,
        },
      )
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith(
        'pi_test_123',
      )
    })

    it('creates a fresh Stripe intent when idempotent replay returns canceled', async () => {
      mockValidate
        .mockReturnValueOnce({
          items: [{ id: 1, quantity: 1 }],
          expectedTotal: 12.34,
        })
        .mockReturnValueOnce({})
      mockBooksDB.getBookById.mockResolvedValueOnce({
        id: 1,
        title: 'Sample Book',
        author: 'Sample Author',
        imgUrl: '',
        price: 12.34,
        discount: 0,
      })
      mockStripe.paymentIntents.create
        .mockResolvedValueOnce({
          id: 'pi_canceled_replay',
          status: 'canceled',
          client_secret: 'pi_canceled_secret',
        })
        .mockResolvedValueOnce({
          id: 'pi_fresh_123',
          status: 'requires_payment_method',
          client_secret: 'pi_fresh_secret',
        })
      mockOrdersDB.getOrder.mockResolvedValueOnce(null)
      mockOrdersDB.createOrder.mockResolvedValueOnce(
        createOrder({
          paymentId: 'pi_fresh_123',
          paymentStatus: 'requires_payment_method',
        }),
      )

      const result = await createPaymentIntent(
        {
          items: [{ id: 1, quantity: 1 }],
          expectedTotal: 12.34,
        },
        null,
        'req_test_123',
      )

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledTimes(2)
      expect(mockStripe.paymentIntents.create).toHaveBeenNthCalledWith(
        1,
        {
          amount: 1234,
          currency: 'usd',
          metadata: {
            requestId: 'req_test_123',
          },
        },
        {
          idempotencyKey: 'req_test_123',
        },
      )
      expect(mockStripe.paymentIntents.create).toHaveBeenNthCalledWith(
        2,
        {
          amount: 1234,
          currency: 'usd',
          metadata: {
            requestId: 'req_test_123',
          },
        },
        expect.anything(),
      )

      const secondCreateOptions: unknown =
        mockStripe.paymentIntents.create.mock.calls[1]?.[1]
      expect(hasStringIdempotencyKey(secondCreateOptions)).toBe(true)
      if (!hasStringIdempotencyKey(secondCreateOptions)) {
        throw new Error('Expected Stripe options with string idempotencyKey')
      }
      const secondIdempotencyKey = secondCreateOptions.idempotencyKey
      expect(secondIdempotencyKey.startsWith('req_test_123:')).toBe(true)
      expect(result).toEqual({
        paymentId: 'pi_fresh_123',
        paymentToken: 'pi_fresh_secret',
        amount: 1234,
      })
    })
  })

  describe('retrieveOrderSyncStatus', () => {
    it('returns mapped order sync response for authorized guest access', async () => {
      const order = createOrder({
        paymentStatus: 'succeeded',
        paidAt: new Date('2026-02-24T10:03:00.000Z'),
      })
      mockOrdersDB.getOrder.mockResolvedValueOnce(order)

      const result = await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(result).toEqual({
        paymentId: 'pi_test_123',
        paymentStatus: 'succeeded',
        amount: 1234,
        currency: 'USD',
        receiptEmail: 'guest@example.com',
        shipping: null,
        finalizedAt: '2026-02-24T10:03:00.000Z',
        webhookUpdatedAt: '2026-02-24T10:05:00.000Z',
      })
      expect(mockOrdersDB.getOrder).toHaveBeenCalledTimes(1)
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
    })

    it('falls back to Stripe when retryable status is stale', async () => {
      const staleOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(Date.now() - 60_000),
      })
      const syncedOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(),
        lastStripeSyncCheckedAt: new Date(),
      })

      mockOrdersDB.getOrder.mockResolvedValueOnce(staleOrder)
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        status: 'processing',
      })
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: syncedOrder,
        becamePaid: false,
      })

      const result = await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(result.paymentStatus).toBe('processing')
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1)
      expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
        'pi_test_123',
        expect.objectContaining({
          lastStripeSyncCheckedAt: expect.any(Date) as Date,
        }),
      )
      expect(mockEnqueueEmail).not.toHaveBeenCalled()
    })

    it('does not call Stripe again immediately after unchanged fallback sync', async () => {
      const now = new Date()
      const staleOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(now.getTime() - 60_000),
        lastStripeSyncCheckedAt: null,
      })
      const recentlyCheckedOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: now,
        lastStripeSyncCheckedAt: now,
      })

      mockOrdersDB.getOrder
        .mockResolvedValueOnce(staleOrder)
        .mockResolvedValueOnce(recentlyCheckedOrder)
      mockStripe.paymentIntents.retrieve.mockResolvedValue({
        status: 'processing',
      })
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: recentlyCheckedOrder,
        becamePaid: false,
      })

      await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })
      await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1)
    })

    it('saves fallback check timestamp even when Stripe sync fails', async () => {
      const now = new Date()
      const staleOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(now.getTime() - 60_000),
      })
      const recentlyCheckedOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: now,
        lastStripeSyncCheckedAt: now,
      })

      mockOrdersDB.getOrder
        .mockResolvedValueOnce(staleOrder)
        .mockResolvedValueOnce(recentlyCheckedOrder)
      mockStripe.paymentIntents.retrieve.mockRejectedValueOnce(
        new Error('Stripe unavailable'),
      )
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: recentlyCheckedOrder,
        becamePaid: false,
      })

      await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })
      await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(mockOrdersDB.updateOrder).toHaveBeenCalledTimes(1)
      expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
        'pi_test_123',
        expect.objectContaining({
          lastStripeSyncCheckedAt: expect.any(Date) as Date,
        }),
      )
      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1)
    })

    it('updates status and fallback timestamp when Stripe reports drift', async () => {
      const staleOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(Date.now() - 60_000),
        paidAt: null,
      })
      const syncedOrder = createOrder({
        paymentStatus: 'succeeded',
        paidAt: new Date(),
        updatedAt: new Date(),
        lastStripeSyncCheckedAt: new Date(),
      })

      mockOrdersDB.getOrder.mockResolvedValueOnce(staleOrder)
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        status: 'succeeded',
      })
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: syncedOrder,
        becamePaid: true,
      })

      await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith(
        'pi_test_123',
        expect.objectContaining({
          paymentStatus: 'succeeded',
          paidAt: expect.any(Date) as Date,
          lastStripeSyncCheckedAt: expect.any(Date) as Date,
        }),
      )
      expect(mockEnqueueEmail).toHaveBeenCalledTimes(2)
      expect(mockEnqueueEmail).toHaveBeenCalledWith('orderConfirmation', {
        order: syncedOrder,
      })
      expect(mockEnqueueEmail).toHaveBeenCalledWith(
        'adminPaymentNotification',
        {
          order: syncedOrder,
          notificationType: 'confirmed',
        },
      )
    })

    it('does not send confirmed notifications when fallback drift is non-succeeded', async () => {
      const staleOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(Date.now() - 60_000),
        paidAt: null,
      })
      const syncedOrder = createOrder({
        paymentStatus: 'canceled',
        paidAt: null,
        updatedAt: new Date(),
        lastStripeSyncCheckedAt: new Date(),
      })

      mockOrdersDB.getOrder.mockResolvedValueOnce(staleOrder)
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        status: 'canceled',
      })
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: syncedOrder,
        becamePaid: false,
      })

      await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(mockEnqueueEmail).not.toHaveBeenCalled()
    })

    it('throws 503 and notifies admin when drift is detected but DB update returns null', async () => {
      const staleOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(Date.now() - 60_000),
        paidAt: null,
      })
      const stripeShipping = {
        name: 'Buyer Example',
        phone: null,
        address: {
          city: 'Budapest',
          country: 'HU',
          line1: 'Example st. 1',
          line2: null,
          postal_code: '1011',
          state: null,
        },
      }

      mockOrdersDB.getOrder.mockResolvedValueOnce(staleOrder)
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        status: 'succeeded',
        receipt_email: 'stripe@example.com',
        shipping: stripeShipping,
      })
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: null,
        becamePaid: false,
      })

      let resultError: unknown = null

      try {
        await retrieveOrderSyncStatus('pi_test_123', {
          paymentSessionId: 'pi_test_123',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(ServiceUnavailable)
      expect((resultError as ServiceUnavailable).status).toBe(503)
      expect(mockEnqueueEmail).toHaveBeenCalledTimes(1)
      expect(mockEnqueueEmail).toHaveBeenCalledWith(
        'adminPaymentNotification',
        expect.objectContaining({
          notificationType: 'error',
          order: expect.objectContaining({
            paymentId: 'pi_test_123',
            paymentStatus: 'succeeded',
            email: 'stripe@example.com',
            shipping: stripeShipping,
          }) as Order,
        }),
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[CRITICAL] Stripe fallback detected status drift but DB save failed',
        expect.objectContaining({
          issueCode: IssueCode.ORDER_SYNC_DRIFT_SAVE_FAILED,
          saveFailureReason: 'returned_null',
          entity: 'order',
          operation: 'update',
        }),
      )
    })

    it('throws 503 and notifies admin when drift is detected but DB update throws', async () => {
      const staleOrder = createOrder({
        paymentStatus: 'processing',
        updatedAt: new Date(Date.now() - 60_000),
        paidAt: null,
      })
      const stripeShipping = {
        name: 'Buyer Example',
        phone: null,
        address: {
          city: 'Budapest',
          country: 'HU',
          line1: 'Example st. 2',
          line2: null,
          postal_code: '1012',
          state: null,
        },
      }

      mockOrdersDB.getOrder.mockResolvedValueOnce(staleOrder)
      mockStripe.paymentIntents.retrieve.mockResolvedValueOnce({
        status: 'canceled',
        receipt_email: 'stripe-cancel@example.com',
        shipping: stripeShipping,
      })
      mockOrdersDB.updateOrder.mockRejectedValueOnce(
        new Error('DB write failed'),
      )

      let resultError: unknown = null

      try {
        await retrieveOrderSyncStatus('pi_test_123', {
          paymentSessionId: 'pi_test_123',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(ServiceUnavailable)
      expect((resultError as ServiceUnavailable).status).toBe(503)
      expect(mockEnqueueEmail).toHaveBeenCalledTimes(1)
      expect(mockEnqueueEmail).toHaveBeenCalledWith(
        'adminPaymentNotification',
        expect.objectContaining({
          notificationType: 'error',
          order: expect.objectContaining({
            paymentId: 'pi_test_123',
            paymentStatus: 'canceled',
            email: 'stripe-cancel@example.com',
            shipping: stripeShipping,
          }) as Order,
        }),
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[CRITICAL] Stripe fallback detected status drift but DB save failed',
        expect.objectContaining({
          issueCode: IssueCode.ORDER_SYNC_DRIFT_SAVE_FAILED,
          saveFailureReason: 'threw',
          entity: 'order',
          operation: 'update',
        }),
      )
    })

    it('does not fallback to Stripe for non-retryable status', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(
        createOrder({
          paymentStatus: 'canceled',
          updatedAt: new Date(Date.now() - 3600_000),
        }),
      )

      const result = await retrieveOrderSyncStatus('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(result.paymentStatus).toBe('canceled')
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
      expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    })
  })

  describe('cancelPaymentIntent', () => {
    it('rejects unauthorized cancel before hitting Stripe', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(createOrder())

      let resultError: unknown = null

      try {
        await cancelPaymentIntent('pi_test_123', {
          userEmail: 'other@example.com',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Unauthorized)
      expect(mockStripe.paymentIntents.retrieve).not.toHaveBeenCalled()
      expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled()
      expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    })

    it('rejects cancel for already canceled payment before hitting Stripe', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(
        createOrder({ paymentStatus: 'canceled' }),
      )

      let resultError: unknown = null

      try {
        await cancelPaymentIntent('pi_test_123', {
          paymentSessionId: 'pi_test_123',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(BadRequest)
      expect((resultError as Error).message).toBe('Payment already canceled')
      expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled()
      expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    })

    it('rejects cancel for succeeded payment before hitting Stripe', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(
        createOrder({ paymentStatus: 'succeeded' }),
      )

      let resultError: unknown = null

      try {
        await cancelPaymentIntent('pi_test_123', {
          paymentSessionId: 'pi_test_123',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(BadRequest)
      expect((resultError as Error).message).toBe(
        'Cannot cancel a successful payment',
      )
      expect(mockStripe.paymentIntents.cancel).not.toHaveBeenCalled()
      expect(mockOrdersDB.updateOrder).not.toHaveBeenCalled()
    })

    it('defers processing payment cancellation eligibility to Stripe', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(
        createOrder({ paymentStatus: 'processing' }),
      )
      mockStripe.paymentIntents.cancel.mockResolvedValueOnce({
        id: 'pi_test_123',
        status: 'canceled',
      })
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: createOrder({ paymentStatus: 'canceled' }),
        becamePaid: false,
      })

      const result = await cancelPaymentIntent('pi_test_123', {
        paymentSessionId: 'pi_test_123',
      })

      expect(result.id).toBe('pi_test_123')
      expect(result.status).toBe('canceled')
      expect(mockStripe.paymentIntents.cancel).toHaveBeenCalledWith(
        'pi_test_123',
      )
      expect(mockOrdersDB.updateOrder).toHaveBeenCalledWith('pi_test_123', {
        paymentStatus: 'canceled',
      })
    })

    it('throws 500 and notifies admin when cancel save fails', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(
        createOrder({ paymentStatus: 'requires_action' }),
      )
      mockStripe.paymentIntents.cancel.mockResolvedValueOnce({
        id: 'pi_test_123',
        status: 'canceled',
      })
      mockOrdersDB.updateOrder.mockRejectedValueOnce(
        new Error('cancel save failed'),
      )

      let resultError: unknown = null

      try {
        await cancelPaymentIntent('pi_test_123', {
          paymentSessionId: 'pi_test_123',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Internal)
      expect((resultError as Internal).status).toBe(500)
      expect(mockEnqueueEmail).toHaveBeenCalledTimes(1)
      expect(mockEnqueueEmail).toHaveBeenCalledWith(
        'adminPaymentNotification',
        expect.objectContaining({
          notificationType: 'error',
          order: expect.objectContaining({
            paymentId: 'pi_test_123',
          }) as Order,
        }),
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[CRITICAL] Stripe payment canceled but order save failed',
        expect.objectContaining({
          issueCode: IssueCode.PAYMENT_CANCEL_SAVE_FAILED,
          saveFailureReason: 'threw',
          entity: 'order',
          operation: 'update',
          stripeStatus: 'canceled',
        }),
      )
    })

    it('throws 500 and notifies admin when cancel save returns null', async () => {
      mockOrdersDB.getOrder.mockResolvedValueOnce(
        createOrder({ paymentStatus: 'requires_action' }),
      )
      mockStripe.paymentIntents.cancel.mockResolvedValueOnce({
        id: 'pi_test_123',
        status: 'canceled',
      })
      mockOrdersDB.updateOrder.mockResolvedValueOnce({
        order: null,
        becamePaid: false,
      })

      let resultError: unknown = null

      try {
        await cancelPaymentIntent('pi_test_123', {
          paymentSessionId: 'pi_test_123',
        })
      } catch (error) {
        resultError = error
      }

      expect(resultError).toBeInstanceOf(Internal)
      expect((resultError as Internal).status).toBe(500)
      expect(mockEnqueueEmail).toHaveBeenCalledTimes(1)
      expect(mockEnqueueEmail).toHaveBeenCalledWith(
        'adminPaymentNotification',
        expect.objectContaining({
          notificationType: 'error',
          order: expect.objectContaining({
            paymentId: 'pi_test_123',
          }) as Order,
        }),
      )
      expect(mockLogger.error).toHaveBeenCalledWith(
        '[CRITICAL] Stripe payment canceled but order save failed',
        expect.objectContaining({
          issueCode: IssueCode.PAYMENT_CANCEL_SAVE_FAILED,
          saveFailureReason: 'returned_null',
          entity: 'order',
          operation: 'update',
          stripeStatus: 'canceled',
        }),
      )
    })
  })
})
