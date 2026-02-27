import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { BaseError } from './BaseError'

export class BadRequest extends BaseError {
  constructor(
    message = 'Bad Request',
    name = 'BadRequest',
    statusCode: ContentfulStatusCode = status.BAD_REQUEST,
  ) {
    super(message, name, statusCode)
  }
}
