import status from 'http-status'
import { BaseError } from './BaseError'

export class BadRequest extends BaseError {
  constructor(
    message = 'Bad Request',
    name = 'BadRequest',
    statusCode = status.BAD_REQUEST,
  ) {
    super(message, name, statusCode)
  }
}
