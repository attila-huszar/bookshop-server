import { BaseError } from './BaseError'
import status from 'http-status'

export class UnauthorizedError extends BaseError {
  constructor(
    message = 'Unauthorized',
    name = 'UnauthorizedError',
    statusCode = status.UNAUTHORIZED,
  ) {
    super(message, name, statusCode)
  }
}
