import { rateLimiter, type Store } from 'hono-rate-limiter'
import { shortHash } from '@/utils/string.utils'
import { httpPolicy } from '@/constants/http'
import { HttpErrorCode } from '@/types/enums'

export function createRateLimitMiddleware(store?: Store) {
  return rateLimiter({
    store,
    windowMs: httpPolicy.rateLimitWindowMs,
    limit: httpPolicy.rateLimit,
    message: { code: HttpErrorCode.RateLimited },
    statusCode: 429,
    standardHeaders: 'draft-6',
    keyGenerator: (c) => {
      const forwarded =
        c.req.header('CF-Connecting-IP') ??
        c.req.header('X-Forwarded-For') ??
        c.req.header('X-Real-Ip')

      const forwardedIp = forwarded
        ? forwarded.split(',')[0]!.trim()
        : 'unknown'

      const userAgent = c.req.header('User-Agent') ?? ''
      const acceptLanguage = c.req.header('Accept-Language') ?? ''
      const fingerprint = shortHash(`${userAgent}|${acceptLanguage}`)

      return `${forwardedIp}:${fingerprint}`
    },
  })
}
