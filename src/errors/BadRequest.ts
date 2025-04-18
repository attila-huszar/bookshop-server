import { BaseError } from './BaseError'
import status from 'http-status'

export class BadRequest extends BaseError {
  constructor(
    message = 'Bad Request',
    name = 'BadRequest',
    statusCode = status.BAD_REQUEST,
  ) {
    super(message, name, statusCode)
  }
}
