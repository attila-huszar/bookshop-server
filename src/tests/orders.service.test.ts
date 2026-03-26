import { beforeEach, describe, expect, it } from 'bun:test'
import { type Order } from '@/types'
import { mockOrdersDB, mockUsersDB } from './test-setup'

const { getUserOrders } = await import('@/services/orders.service')

const createOrder = (overrides: Partial<Order> = {}): Order => ({
  id: 1,
  paymentId: 'pi_test_123',
  paymentStatus: 'succeeded',
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastStripeSyncCheckedAt: null,
  paidAt: new Date('2026-02-24T10:03:00.000Z'),
  total: 12.34,
  currency: 'USD',
  items: [],
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@example.com',
  shipping: null,
  createdAt: new Date('2026-02-24T10:00:00.000Z'),
  updatedAt: new Date('2026-02-24T10:05:00.000Z'),
  ...overrides,
})

describe('Orders Service', () => {
  beforeEach(() => {
    mockUsersDB.getUserBy.mockReset()
    mockOrdersDB.getOrdersByEmail.mockReset()
  })

  it('returns orders for the authenticated user', async () => {
    mockUsersDB.getUserBy.mockResolvedValueOnce({
      uuid: 'user-uuid',
      email: 'john@example.com',
    })
    mockOrdersDB.getOrdersByEmail.mockResolvedValueOnce([
      createOrder({ id: 2 }),
      createOrder({ id: 1 }),
    ])

    const result = await getUserOrders('user-uuid')

    expect(mockUsersDB.getUserBy).toHaveBeenCalledWith('uuid', 'user-uuid')
    expect(mockOrdersDB.getOrdersByEmail).toHaveBeenCalledWith(
      'john@example.com',
    )
    expect(result).toHaveLength(2)
    expect(result[0]?.id).toBe(2)
  })

  it('throws when user does not exist', async () => {
    mockUsersDB.getUserBy.mockResolvedValueOnce(null)

    let resultError: unknown = null

    try {
      await getUserOrders('missing-user-uuid')
    } catch (error) {
      resultError = error
    }

    expect(resultError).toMatchObject({ status: 404, name: 'NotFound' })
    expect(mockOrdersDB.getOrdersByEmail).not.toHaveBeenCalled()
  })
})
