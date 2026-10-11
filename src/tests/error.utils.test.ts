import { describe, expect, it } from 'bun:test'
import { getErrorCode } from '@/utils/error.utils'

describe('getErrorCode', () => {
  it('preserves numeric and string error codes', () => {
    expect(getErrorCode(Object.assign(new Error(), { code: 11000 }))).toBe(
      11000,
    )
    expect(
      getErrorCode(Object.assign(new Error(), { code: 'ECONNREFUSED' })),
    ).toBe('ECONNREFUSED')
    expect(getErrorCode(Object.assign(new Error(), { code: 0 }))).toBe(0)
  })

  it('ignores missing or unsupported codes and non-Error values', () => {
    for (const value of [
      new Error(),
      Object.assign(new Error(), { code: null }),
      Object.assign(new Error(), { code: {} }),
      Object.assign(new Error(), { code: true }),
      { code: 11000 },
      null,
      undefined,
      'ECONNREFUSED',
    ]) {
      expect(getErrorCode(value)).toBeUndefined()
    }
  })
})
