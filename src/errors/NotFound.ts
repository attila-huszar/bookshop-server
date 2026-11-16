import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { HttpErrorCode } from '@/types/enums'
import { BaseError } from './BaseError'

export class NotFound extends BaseError {
  constructor(
    message = 'Not Found',
    statusCode: ContentfulStatusCode = status.NOT_FOUND,
  ) {
    super(message, 'NotFound', statusCode, HttpErrorCode.NotFound)
  }
}
