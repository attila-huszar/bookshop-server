import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { type ErrorCode, HttpErrorCode } from '@/types/enums'
import { BaseError } from './BaseError'

export class Forbidden extends BaseError {
  constructor(
    message = 'Forbidden',
    code: ErrorCode = HttpErrorCode.Forbidden,
    statusCode: ContentfulStatusCode = status.FORBIDDEN,
  ) {
    super(message, 'Forbidden', statusCode, code)
  }
}
