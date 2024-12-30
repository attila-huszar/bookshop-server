import { getUserBy } from '../repository'
import { validateEmail, validatePassword } from '../utils'
import * as Errors from '../errors'
import type {
  LoginRequest,
  Order,
  OrderUpdate,
  PasswordResetRequest,
  RegisterRequest,
  TokenRequest,
} from '../types'

type ValidateReturnType = {
  login: { uuid: string; firstName: string }
  registration: RegisterRequest
  verification: { email: string }
  passwordResetRequest: { email: string; firstName: string }
  passwordResetToken: { email: string; message?: string }
  orderCreate: Order
  orderUpdate: OrderUpdate
}

export async function validate<T extends keyof ValidateReturnType>(
  type: T,
  req:
    | LoginRequest
    | RegisterRequest
    | TokenRequest
    | PasswordResetRequest
    | Order
    | OrderUpdate,
): Promise<ValidateReturnType[T]> {
  const requiredFields = {
    login: ['email', 'password'],
    registration: ['email', 'password', 'firstName', 'lastName'],
    verification: ['token'],
    passwordResetRequest: ['email'],
    passwordResetToken: ['token'],
    orderCreate: [
      'paymentId',
      'paymentIntentStatus',
      'orderStatus',
      'total',
      'currency',
      'items',
    ] as (keyof Order)[],
    orderUpdate: ['paymentId', 'fields'],
  }[type]

  if (requiredFields.some((field) => !req[field as keyof typeof req])) {
    throw new Errors.BadRequest(Errors.messages.fieldsRequired)
  }

  if ('email' in req && !validateEmail(req.email!)) {
    throw new Errors.BadRequest(Errors.messages.invalidEmailFormat)
  }

  if ('password' in req && !validatePassword(req.password)) {
    throw new Errors.BadRequest(Errors.messages.invalidPasswordFormat)
  }

  switch (type) {
    case 'login': {
      const { email } = req as LoginRequest
      const user = await getUserBy('email', email)

      if (!user) {
        throw new Errors.Unauthorized(Errors.messages.emailOrPasswordError)
      }

      if (!user.verified) {
        throw new Errors.Forbidden(Errors.messages.verifyFirst)
      }

      const isPasswordCorrect = await Bun.password.verify(
        (req as LoginRequest).password,
        user.password,
      )

      if (isPasswordCorrect) {
        return {
          uuid: user.uuid,
          firstName: user.firstName,
        } as ValidateReturnType[T]
      }

      throw new Errors.Unauthorized()
    }

    case 'registration': {
      const { email } = req as RegisterRequest
      const user = await getUserBy('email', email)

      if (user) {
        throw new Errors.BadRequest(Errors.messages.emailTaken)
      }

      if (user === null) {
        return req as ValidateReturnType[T]
      }

      throw new Errors.Internal(Errors.messages.unknown)
    }

    case 'verification': {
      const { token } = req as TokenRequest
      const user = await getUserBy('verificationToken', token)

      if (!user?.verificationToken || !user.verificationExpires) {
        throw new Errors.BadRequest(Errors.messages.tokenInvalid)
      }

      const expirationDate = new Date(user.verificationExpires)

      if (expirationDate < new Date()) {
        throw new Errors.Forbidden(Errors.messages.tokenExpired)
      }

      if (user.verificationToken === token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden(Errors.messages.tokenInvalid)
    }

    case 'passwordResetRequest': {
      const { email } = req as PasswordResetRequest
      const user = await getUserBy('email', email)

      if (user) {
        return {
          email: user.email,
          firstName: user.firstName,
        } as ValidateReturnType[T]
      }

      throw new Errors.Internal(Errors.messages.unknown)
    }

    case 'passwordResetToken': {
      const { token } = req as TokenRequest
      const user = await getUserBy('passwordResetToken', token)

      if (
        !user?.passwordResetToken ||
        !user.passwordResetExpires ||
        isNaN(Date.parse(user.passwordResetExpires))
      ) {
        throw new Errors.BadRequest(Errors.messages.tokenInvalid)
      }

      const expirationDate = new Date(user.passwordResetExpires)

      if (expirationDate < new Date()) {
        return {
          email: user.email,
          message: Errors.messages.tokenExpired,
        } as ValidateReturnType[T]
      }

      if (user.passwordResetToken === token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden(Errors.messages.tokenInvalid)
    }

    case 'orderCreate': {
      return req as ValidateReturnType[T]
    }

    case 'orderUpdate': {
      return req as ValidateReturnType[T]
    }

    default: {
      throw new Error('Invalid validation type')
    }
  }
}
