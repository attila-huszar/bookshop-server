import status from 'http-status'
import { BaseError } from './BaseError'

export class Internal extends BaseError {
  constructor(
    message = 'Internal Server Error',
    name = 'InternalServerError',
    statusCode = status.INTERNAL_SERVER_ERROR,
  ) {
    super(message, name, statusCode)
  }
}
