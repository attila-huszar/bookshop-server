import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { BaseError } from './BaseError'

export class ServiceUnavailable extends BaseError {
  constructor(
    message = 'Service Unavailable',
    name = 'ServiceUnavailable',
    statusCode: ContentfulStatusCode = status.SERVICE_UNAVAILABLE,
  ) {
    super(message, name, statusCode)
  }
}
