import { getUserBy } from '../repository'
import { validateEmail, validatePassword } from '../utils'
import * as Errors from '../errors'
import type {
  LoginRequest,
  OrderRequest,
  PasswordResetRequest,
  RegisterRequest,
  TokenRequest,
} from '../types'

type ValidateReturnType = {
  login: { uuid: string; firstName: string }
  registration: RegisterRequest
  verification: { email: string }
  passwordResetRequest: { email: string }
  passwordResetToken: { email: string; message?: string }
  orderCreate: OrderRequest
  orderUpdate: OrderRequest
}

export async function validate<T extends keyof ValidateReturnType>(
  type: T,
  req:
    | LoginRequest
    | RegisterRequest
    | TokenRequest
    | PasswordResetRequest
    | OrderRequest
    | Pick<OrderRequest, 'paymentId' | 'status'>,
): Promise<ValidateReturnType[T]> {
  const requiredFields = {
    login: ['email', 'password'],
    registration: ['email', 'password', 'firstName', 'lastName'],
    verification: ['token'],
    passwordResetRequest: ['email'],
    passwordResetToken: ['token'],
    orderCreate: [
      'paymentId',
      'total',
      'currency',
      'items',
      'firstName',
      'lastName',
      'email',
      'address',
    ],
    orderUpdate: ['paymentId', 'status'],
  }[type]

  if (requiredFields.some((field) => !req[field as keyof typeof req])) {
    throw new Errors.BadRequest('Fields required')
  }

  if ('email' in req && !validateEmail(req.email)) {
    throw new Errors.BadRequest('Invalid email format')
  }

  if ('password' in req && !validatePassword(req.password)) {
    throw new Errors.BadRequest('Invalid password format')
  }

  switch (type) {
    case 'login': {
      const { email } = req as LoginRequest
      const user = await getUserBy('email', email)

      if (!user) {
        throw new Errors.Unauthorized()
      }

      if (!user.verified) {
        throw new Errors.Forbidden('Email not verified')
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

      if (user === null) {
        return req as ValidateReturnType[T]
      }

      throw new Errors.BadRequest('Email already taken')
    }

    case 'verification': {
      const { token } = req as TokenRequest
      const user = await getUserBy('verificationToken', token)

      if (!user) {
        throw new Errors.BadRequest('User not found')
      }

      if (!user.verificationToken || !user.verificationExpires) {
        throw new Errors.BadRequest('Verification data incomplete')
      }

      const expirationDate = new Date(user.verificationExpires)

      if (expirationDate < new Date()) {
        throw new Errors.Forbidden('Verification token expired')
      }

      if (user.verificationToken === token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden('Invalid verification token')
    }

    case 'passwordResetRequest': {
      const { email } = req as PasswordResetRequest
      const user = await getUserBy('email', email)

      if (!user) {
        throw new Errors.BadRequest('Email not found')
      }

      if (user.email) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Internal(
        'Unhandled error in password reset request validation',
      )
    }

    case 'passwordResetToken': {
      const { token } = req as TokenRequest
      const user = await getUserBy('passwordResetToken', token)

      if (!user) {
        throw new Errors.BadRequest('User not found')
      }

      if (
        !user.passwordResetExpires ||
        isNaN(Date.parse(user.passwordResetExpires))
      ) {
        throw new Errors.BadRequest(
          'Password reset expiration date is invalid or missing',
        )
      }

      const expirationDate = new Date(user.passwordResetExpires)

      if (expirationDate < new Date()) {
        return {
          email: user.email,
          message: 'Password reset token has expired, please request a new one',
        } as ValidateReturnType[T]
      }

      if (user.passwordResetToken === token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden('Invalid password reset token')
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
