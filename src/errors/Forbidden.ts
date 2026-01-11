import status from 'http-status'
import { BaseError } from './BaseError'

export class Forbidden extends BaseError {
  constructor(
    message = 'Forbidden',
    name = 'Forbidden',
    statusCode = status.FORBIDDEN,
  ) {
    super(message, name, statusCode)
  }
}
