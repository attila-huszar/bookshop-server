import { beforeEach, describe, expect, it } from 'bun:test'
import {
  cancelPaymentIntent,
  retrieveOrderSyncStatus,
  retrievePaymentIntent,
} from '@/services/payments.service'
import { Unauthorized } from '@/errors'
import type { Order } from '@/types'
import { mockOrdersDB, mockStripe, mockValidate } from './test-setup'

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'processing',
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

describe('Payments Service', () => {
  beforeEach(() => {
    mockValidate.mockClear()
    mockOrdersDB.getOrder.mockClear()
    mockOrdersDB.updateOrder.mockClear()
    mockStripe.paymentIntents.retrieve.mockClear()
    mockStripe.paymentIntents.cancel.mockClear()

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
  })
})
