import { MemoryStore, RedisStore, type Store } from 'hono-rate-limiter'
import Redis from 'ioredis'
import { TimeMs } from '@/constants/time'
import { log } from './logger'

export function createRateLimitStore(redisUrl: string) {
  const redis = new Redis(redisUrl, {
    enableOfflineQueue: false,
    autoResendUnfulfilledCommands: false,
    maxRetriesPerRequest: 0,
    commandTimeout: TimeMs.OneSecond,
    connectTimeout: TimeMs.OneSecond,
  })
  const local = new MemoryStore()
  const shared = new RedisStore({
    prefix: 'bookshop:api:rate-limit:',
    client: {
      scriptLoad: async (script) =>
        (await redis.script('LOAD', script)) as string,
      async evalsha<TArgs extends unknown[], TData>(
        sha: string,
        keys: string[],
        args: TArgs,
      ) {
        return (await redis.evalsha(
          sha,
          keys.length,
          ...keys,
          ...args.map(String),
        )) as TData
      },
      decr: (key) => redis.decr(key),
      del: (key) => redis.del(key),
    },
  })
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
      shared.init(options)
      local.init(options)
    },
    increment: (key) =>
      withFallback(
        () => shared.increment(key),
        () => local.increment(key),
      ),
    decrement: (key) =>
      withFallback(
        () => shared.decrement(key),
        () => local.decrement(key),
      ),
    resetKey: (key) => {
      local.resetKey(key)

      return withFallback(
        () => shared.resetKey(key),
        () => undefined,
      )
    },
    shutdown: () => {
      redis.disconnect()
      local.shutdown()
    },
  } satisfies Store
}
