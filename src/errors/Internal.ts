import status from 'http-status'
import { HttpErrorCode } from '@/types/enums'
import { BaseError } from './BaseError'

export class Internal extends BaseError {
  constructor(message = 'Internal Server Error', options?: ErrorOptions) {
    super(
      message,
      'InternalServerError',
      status.INTERNAL_SERVER_ERROR,
      HttpErrorCode.Internal,
      options,
    )
  }
}
