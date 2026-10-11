import { describe, expect, it } from 'bun:test'
import { getRedisConnectionHint } from '@/utils/redis.utils'

describe('getRedisConnectionHint', () => {
  it('recognizes connection codes regardless of case', () => {
    for (const code of [
      'ECONNREFUSED',
      'enotfound',
      'EAI_AGAIN',
      'ETIMEDOUT',
    ]) {
      const error = Object.assign(new Error('Connection failed'), { code })
      expect(getRedisConnectionHint(error, 'redis://cache:6380')).toBe(
        'Start Redis locally and retry (expected at cache:6380)',
      )
    }
  })

  it('still recognizes connection messages without a code', () => {
    expect(getRedisConnectionHint(new Error('Connection is closed'))).toBe(
      'Start Redis locally and retry (expected at localhost:6379)',
    )
  })

  it('ignores unrelated errors and non-Error values', () => {
    expect(
      getRedisConnectionHint(
        Object.assign(new Error('Duplicate'), { code: 11000 }),
      ),
    ).toBeNull()
    expect(getRedisConnectionHint({ code: 'ECONNREFUSED' })).toBeNull()
    expect(getRedisConnectionHint(null)).toBeNull()
  })
})
