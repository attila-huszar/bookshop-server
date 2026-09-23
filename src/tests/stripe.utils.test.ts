import { describe, expect, it } from 'bun:test'
import type { PublicUser } from '@/types'

const { getPaymentIdempotencyKey } = await import('@/utils/stripe.utils')

describe('Stripe utilities', () => {
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
})
