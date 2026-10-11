import { describe, expect, it } from 'bun:test'
import {
  adminUserResponse,
  cmsOrderResponse,
  orderResponse,
  publicUserResponse,
} from '@/utils/response.utils'
import type { Order, User } from '@/types'

describe('API response boundaries', () => {
  it('excludes internal checkout and reconciliation fields from orders', () => {
    const order = {
      id: 1,
      paymentId: null,
      paymentStatus: 'processing',
      total: 10,
      currency: 'USD',
      items: [
        {
          id: 1,
          title: 'Book',
          author: null,
          imgUrl: null,
          price: 10,
          discount: 0,
          quantity: 1,
        },
      ],
      checkoutRequestId: 'internal-key',
      lastStripeEventId: 'evt_internal',
      reconciliationFailures: 3,
      reconciliationAlertId: 'alert-internal',
      firstName: null,
      lastName: null,
      email: null,
      shipping: null,
      paidAt: null,
      createdAt: new Date('2026-10-05'),
      updatedAt: new Date('2026-10-05'),
      deletedAt: new Date('2026-10-08T12:00:00Z'),
    } as Order
    const response = orderResponse(order)

    expect(response).not.toHaveProperty('checkoutRequestId')
    expect(response).not.toHaveProperty('lastStripeEventId')
    expect(response).not.toHaveProperty('reconciliationFailures')
    expect(response).not.toHaveProperty('reconciliationAlertId')
    expect(response).not.toHaveProperty('deletedAt')
    expect(cmsOrderResponse(order)).toEqual({
      ...response,
      deletedAt: '2026-10-08T12:00:00.000Z',
    })
    expect(response.createdAt).toBe('2026-10-05T00:00:00.000Z')
    expect(response.items[0]?.imgUrl).toBe('')
  })
  it('whitelists CMS and profile fields, even if Mongo adds internal properties', () => {
    const user = {
      id: 1,
      uuid: 'user-id',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      country: 'HU',
      role: 'user',
      verified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      password: 'hash',
      verificationToken: 'secret',
      passwordResetToken: 'secret',
      _id: 'mongo-id',
      deletedAt: new Date('2026-10-08T12:00:00Z'),
    } as unknown as User

    for (const response of [
      adminUserResponse(user),
      publicUserResponse(user),
    ]) {
      for (const field of [
        'password',
        'verificationToken',
        'passwordResetToken',
        '_id',
      ]) {
        expect(response).not.toHaveProperty(field)
      }
    }

    expect(adminUserResponse(user).deletedAt).toBe('2026-10-08T12:00:00.000Z')
    expect(publicUserResponse(user)).not.toHaveProperty('deletedAt')
    expect(adminUserResponse(user).verified).toBe(true)
    expect(publicUserResponse(user)).not.toHaveProperty('verified')
    expect(publicUserResponse(user)).not.toHaveProperty('id')
  })
})
