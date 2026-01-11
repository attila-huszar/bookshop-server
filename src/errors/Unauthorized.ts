import status from 'http-status'
import { BaseError } from './BaseError'

export class Unauthorized extends BaseError {
  constructor(
    message = 'Unauthorized',
    name = 'Unauthorized',
    statusCode = status.UNAUTHORIZED,
  ) {
    super(message, name, statusCode)
  }
}
