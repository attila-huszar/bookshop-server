import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { HttpErrorCode } from '@/types/enums'
import { BaseError } from './BaseError'

export class Internal extends BaseError {
  constructor(
    message = 'Internal Server Error',
    statusCode: ContentfulStatusCode = status.INTERNAL_SERVER_ERROR,
  ) {
    super(message, 'InternalServerError', statusCode, HttpErrorCode.Internal)
  }
}
