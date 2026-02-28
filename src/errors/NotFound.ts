import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { BaseError } from './BaseError'

export class NotFound extends BaseError {
  constructor(
    message = 'Not Found',
    name = 'NotFound',
    statusCode: ContentfulStatusCode = status.NOT_FOUND,
  ) {
    super(message, name, statusCode)
  }
}
