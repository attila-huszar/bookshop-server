import { BaseError } from './BaseError'
import status from 'http-status'

export class NotFoundError extends BaseError {
  constructor(
    message = 'Not found',
    name = 'NotFoundError',
    statusCode = status.NOT_FOUND,
  ) {
    super(message, name, statusCode)
  }
}
