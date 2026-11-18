import { describe, expect, it, mock } from 'bun:test'
import { createApp } from '@/app'
import { createRateLimitStore } from '@/libs/rateLimitStore'
import { httpPolicy } from '@/constants/http'
import { mockIORedis } from './test-setup'

function createMockRedis(counters = new Map<string, number>()) {
  const redis = {
    status: 'ready',
    on: mock(),
    disconnect: mock(),
    script: mock(() => {
      if (redis.status !== 'ready') {
        return Promise.reject(new Error('Redis is unavailable'))
      }

      return Promise.resolve('script-sha')
    }),
    evalsha: mock((_sha: string, _keyCount: number, key: string) => {
      const hits = (counters.get(key) ?? 0) + 1
      counters.set(key, hits)

      return Promise.resolve([hits, httpPolicy.rateLimitWindowMs])
    }),
  }

  return redis
}

function createReplica(redis: ReturnType<typeof createMockRedis>) {
  mockIORedis.mockImplementationOnce(() => redis)
  const store = createRateLimitStore('redis://redis.test:6379')

  return { app: createApp(() => true, store), shutdown: store.shutdown }
}

describe('API rate limiter', () => {
  it('enforces a single quota across replicas', async () => {
    const counters = new Map<string, number>()
    const first = createReplica(createMockRedis(counters))
    const second = createReplica(createMockRedis(counters))

    try {
      for (let request = 0; request < httpPolicy.rateLimit; request++) {
        const replica = request % 2 === 0 ? first : second
        const response = await replica.app.request('/')
        expect(response.status).toBe(200)
      }

      const response = await first.app.request('/')
      expect(response.status).toBe(429)
      expect(await response.json()).toEqual({ code: 'RATE_LIMITED' })
      expect(response.headers.get('RateLimit-Limit')).toBe('500')
      expect(response.headers.get('RateLimit-Remaining')).toBe('0')
      expect(response.headers.get('RateLimit-Policy')).toBe('500;w=900')
      expect(response.headers.get('Retry-After')).toBeTruthy()
      expect(counters.size).toBe(1)
      expect(counters.keys().next().value).toMatch(/^bookshop:api:rate-limit:/)
    } finally {
      first.shutdown()
      second.shutdown()
    }
  })

  it('falls back locally and resumes counting in Redis after recovery', async () => {
    const counters = new Map<string, number>()
    const redis = createMockRedis(counters)
    redis.status = 'connecting'
    const { app, shutdown } = createReplica(redis)

    try {
      const request = async () => {
        const response = await app.request('/')
        expect(response.status).toBe(200)

        return response.headers.get('RateLimit-Remaining')
      }

      expect(await request()).toBe('499')
      expect(redis.evalsha).not.toHaveBeenCalled()
      const ready = await app.request('/ready')
      expect(ready.status).toBe(200)
      expect(ready.headers.has('RateLimit-Limit')).toBe(false)

      redis.status = 'ready'
      expect(await request()).toBe('499')
      expect([...counters.values()]).toEqual([1])

      const evaluate = redis.evalsha.getMockImplementation()!
      redis.evalsha.mockRejectedValue(new Error('Command timed out'))
      expect(await request()).toBe('498')
      expect([...counters.values()]).toEqual([1])

      redis.evalsha.mockImplementation(evaluate)
      expect(await request()).toBe('498')
      expect([...counters.values()]).toEqual([2])
    } finally {
      shutdown()
    }

    expect(redis.disconnect).toHaveBeenCalledTimes(1)
  })
})
