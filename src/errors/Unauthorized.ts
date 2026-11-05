import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { type ErrorCode, HttpErrorCode } from '@/types/enums'
import { BaseError } from './BaseError'

export class Unauthorized extends BaseError {
  constructor(
    message = 'Unauthorized',
    code: ErrorCode = HttpErrorCode.Unauthorized,
    statusCode: ContentfulStatusCode = status.UNAUTHORIZED,
  ) {
    super(message, 'Unauthorized', statusCode, code)
  }
}
