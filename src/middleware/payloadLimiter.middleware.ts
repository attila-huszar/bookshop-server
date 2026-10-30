import { type MiddlewareHandler } from 'hono'
import { MAX_IMAGE_SIZE_BYTES, MAX_JSON_SIZE } from '@/constants'
import { HttpErrorCode } from '@/types/enums'

export const payloadLimiter: MiddlewareHandler = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    return next()
  }

  const contentLength = Number(c.req.header('content-length')) || 0
  const contentType = c.req.header('content-type') ?? ''

  if (contentLength === 0) {
    return next()
  }

  if (contentType.includes('application/json')) {
    if (contentLength > MAX_JSON_SIZE * 1024) {
      return c.json(
        {
          code: HttpErrorCode.PayloadTooLarge,
          limit: `${MAX_JSON_SIZE} KB`,
          received: `${Math.ceil(contentLength / 1024)} KB`,
        },
        413,
      )
    }
    return next()
  }

  if (contentType.includes('multipart/form-data')) {
    if (contentLength > MAX_IMAGE_SIZE_BYTES * 1.1) {
      return c.json(
        {
          code: HttpErrorCode.PayloadTooLarge,
          limit: `${MAX_IMAGE_SIZE_BYTES / (1024 * 1024)} MB`,
          received: `${(contentLength / (1024 * 1024)).toFixed(2)} MB`,
        },
        413,
      )
    }
    return next()
  }

  if (contentLength > MAX_JSON_SIZE * 1024) {
    return c.json(
      {
        code: HttpErrorCode.PayloadTooLarge,
        limit: `${MAX_JSON_SIZE} KB`,
        received: `${Math.ceil(contentLength / 1024)} KB`,
      },
      413,
    )
  }

  return next()
}
