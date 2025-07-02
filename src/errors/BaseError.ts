import type { ContentfulStatusCode } from 'hono/utils/http-status'

export class BaseError extends Error {
  status: ContentfulStatusCode

  constructor(message: string, name: string, status: ContentfulStatusCode) {
    super(message)

    this.name = name
    this.status = status

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BaseError)
    }
  }
}
