import { BaseError } from './BaseError'
import status from 'http-status'

export class NotFound extends BaseError {
  constructor(
    message = 'Not Found',
    name = 'NotFoundError',
    statusCode = status.NOT_FOUND,
  ) {
    super(message, name, statusCode)
  }
}