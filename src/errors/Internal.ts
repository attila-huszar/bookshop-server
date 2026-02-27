import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { BaseError } from './BaseError'

export class Internal extends BaseError {
  constructor(
    message = 'Internal Server Error',
    name = 'InternalServerError',
    statusCode: ContentfulStatusCode = status.INTERNAL_SERVER_ERROR,
  ) {
    super(message, name, statusCode)
  }
}
