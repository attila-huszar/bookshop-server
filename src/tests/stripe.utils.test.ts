import { describe, expect, it } from 'bun:test'
import type { PublicUser } from '@/types'

const { getPaymentIdempotencyKey } = await import('@/utils/stripe.utils')

describe('Stripe utilities', () => {
  it('generates stable, separate checkout keys for guests and accounts', () => {
    const request = {
      items: [{ id: 1, quantity: 1 }],
      expectedTotal: 25.99,
    }

    const user = { uuid: 'user-1' } as PublicUser
    const guestKey = getPaymentIdempotencyKey('client-key', request, null)
    const accountKey = getPaymentIdempotencyKey('client-key', request, user)

    expect(guestKey).toBe(
      'bookshop:98d38957149bb4c9f9d14af2a4dd5962383b535c82c50463733bd15541be0f6c',
    )
    expect(accountKey).toBe(
      'bookshop:f1600385efe820fe92d37b75d1f920a5e054472d5d45993a6f81fa6b13fb5b50',
    )
    expect(guestKey).toBe(getPaymentIdempotencyKey('client-key', request, null))
    expect(accountKey).toBe(
      getPaymentIdempotencyKey('client-key', request, user),
    )
    expect(guestKey).not.toBe(accountKey)
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
      getPaymentIdempotencyKey('another-client-key', request, user),
    ).not.toBe(getPaymentIdempotencyKey('client-key', request, user))
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
})
