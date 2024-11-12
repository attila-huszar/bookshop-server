import type { StatusCode } from 'hono/utils/http-status'

export class BaseError extends Error {
  status: StatusCode

  constructor(message: string, name: string, status: StatusCode) {
    super(message)

    this.name = name
    this.status = status

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BaseError)
    }
  }
}
