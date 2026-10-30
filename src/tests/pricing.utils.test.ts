import { describe, expect, it } from 'bun:test'
import { calculatePriceCents, toCents } from '@/utils/pricing.utils'

describe('cent pricing', () => {
  it.each([
    [1.005, 101],
    [10.075, 1008],
    [9.99, 999],
    [1e-7, 0],
    [0, 0],
  ])('rounds %s to %s cents', (amount, cents) => {
    expect(toCents(amount)).toBe(cents)
  })

  it.each([
    [9.99, 20, 100, 79900],
    [9.99, 50, 3, 1500],
    [0.05, 10, 100, 500],
    [12.34, 0, 2, 2468],
    [9.99, 100, 3, 0],
  ])(
    'prices %s at %s%% off, quantity %s, as %s cents',
    (price, discount, quantity, cents) => {
      expect(calculatePriceCents(price, discount, quantity)).toBe(cents)
    },
  )
})
