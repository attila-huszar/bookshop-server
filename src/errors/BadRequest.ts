import type { ContentfulStatusCode } from 'hono/utils/http-status'
import status from 'http-status'
import { type ErrorCode, HttpErrorCode } from '@/types/enums'
import { BaseError } from './BaseError'

export class BadRequest extends BaseError {
  constructor(
    message = 'Bad Request',
    code: ErrorCode = HttpErrorCode.BadRequest,
    statusCode: ContentfulStatusCode = status.BAD_REQUEST,
  ) {
    super(message, 'BadRequest', statusCode, code)
  }
}
