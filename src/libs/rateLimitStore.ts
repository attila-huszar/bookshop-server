import { MemoryStore, type Store } from 'hono-rate-limiter'
import Redis from 'ioredis'
import { TimeMs } from '@/constants/time'
import { log } from './logger'

const keyPrefix = 'bookshop:api:rate-limit:'
const incrementCounter = `
local hits = redis.call('INCR', KEYS[1])
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then
  ttl = tonumber(ARGV[1])
  redis.call('PEXPIRE', KEYS[1], ttl)
end
return { hits, ttl }
`
const decrementCounter = `
local hits = tonumber(redis.call('GET', KEYS[1]))
if hits and hits > 0 then
  redis.call('DECR', KEYS[1])
end
`

export function createRateLimitStore(redisUrl?: string) {
  const local = new MemoryStore()

  if (!redisUrl) {
    return local
  }

  const redis = new Redis(redisUrl, {
    enableOfflineQueue: false,
    autoResendUnfulfilledCommands: false,
    maxRetriesPerRequest: 0,
    commandTimeout: TimeMs.OneSecond,
    connectTimeout: TimeMs.OneSecond,
  })
  let windowMs: number
  let usingFallback = false

  function reportFallback(error?: unknown) {
    if (usingFallback) {
      return
    }

    usingFallback = true
    log.warn('⚠️ API rate limiter using per-replica counters', { error })
  }

  redis.on('error', reportFallback)

  async function withFallback<T>(
    useRedis: () => Promise<T>,
    useLocal: () => T,
  ) {
    if (redis.status === 'ready') {
      try {
        const result = await useRedis()

        if (usingFallback) {
          usingFallback = false
          log.info('✅ API rate limiter resumed using shared counters')
        }

        return result
      } catch (error) {
        reportFallback(error)
      }
    } else {
      reportFallback()
    }

    return useLocal()
  }

  return {
    init: (options) => {
      windowMs = options.windowMs
      local.init(options)
    },
    increment: (key) =>
      withFallback(
        async () => {
          // A timed-out command can still be applied by Redis.
          const [totalHits, ttl] = (await redis.eval(
            incrementCounter,
            1,
            `${keyPrefix}${key}`,
            windowMs,
          )) as [number, number]

          return { totalHits, resetTime: new Date(Date.now() + ttl) }
        },
        () => local.increment(key),
      ),
    decrement: (key) =>
      withFallback(
        async () => {
          await redis.eval(decrementCounter, 1, `${keyPrefix}${key}`)
        },
        () => local.decrement(key),
      ),
    resetKey: (key) => {
      local.resetKey(key)

      return withFallback(
        async () => {
          await redis.del(`${keyPrefix}${key}`)
        },
        () => undefined,
      )
    },
    shutdown: () => {
      redis.disconnect()
      local.shutdown()
    },
  } satisfies Store
}
