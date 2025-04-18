import { BaseError } from './BaseError'
import status from 'http-status'

export class Forbidden extends BaseError {
  constructor(
    message = 'Forbidden',
    name = 'Forbidden',
    statusCode = status.FORBIDDEN,
  ) {
    super(message, name, statusCode)
  }
}
