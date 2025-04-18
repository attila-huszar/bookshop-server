import { BaseError } from './BaseError'
import status from 'http-status'

export class Unauthorized extends BaseError {
  constructor(
    message = 'Unauthorized',
    name = 'Unauthorized',
    statusCode = status.UNAUTHORIZED,
  ) {
    super(message, name, statusCode)
  }
}
