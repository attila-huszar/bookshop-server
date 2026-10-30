import type { ContentfulStatusCode } from 'hono/utils/http-status'
import type { ErrorCode } from '@/types/enums'

/**
 * Application failure with an HTTP status and stable client-facing code.
 * The message is server diagnostic text; errorHandler sends only the code.
 */
export class BaseError extends Error {
  status: ContentfulStatusCode
  code: ErrorCode

  constructor(
    message: string,
    name: string,
    status: ContentfulStatusCode,
    code: ErrorCode,
    options?: ErrorOptions,
  ) {
    super(message, options)

    this.name = name
    this.status = status
    this.code = code

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BaseError)
    }
  }
}
