import { getUserBy } from '../repository'
import { validateEmail, validatePassword } from '../utils'
import * as Errors from '../errors'
import type {
  LoginRequest,
  PasswordResetRequest,
  RegisterRequest,
  TokenRequest,
} from '../types'

type ValidateReturnType = {
  login: { uuid: string; firstName: string }
  registration: RegisterRequest
  verification: { email: string }
  passwordResetRequest: { email: string }
  passwordResetToken: { email: string }
}

export async function validate<T extends keyof ValidateReturnType>(
  type: T,
  req: LoginRequest | RegisterRequest | TokenRequest | PasswordResetRequest,
): Promise<ValidateReturnType[T]> {
  const requiredFields = {
    login: ['email', 'password'],
    registration: ['email', 'password', 'firstName', 'lastName'],
    verification: ['token'],
    passwordResetRequest: ['email'],
    passwordResetToken: ['token'],
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
      const user = await getUserBy('email', (req as LoginRequest).email)

      if (!user) {
        throw new Errors.NotFound()
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

      throw new Errors.Forbidden()
    }

    case 'registration': {
      const isEmailTaken = await getUserBy(
        'email',
        (req as RegisterRequest).email,
      )

      if (isEmailTaken) {
        throw new Errors.BadRequest('Email already taken')
      }

      return req as ValidateReturnType[T]
    }

    case 'verification': {
      const user = await getUserBy(
        'verificationCode',
        (req as TokenRequest).token,
      )

      if (!user || !user.verificationCode || !user.verificationExpires) {
        throw new Errors.BadRequest('Verification data incomplete')
      }

      const expirationDate = new Date(user.verificationExpires)

      if (expirationDate < new Date()) {
        throw new Errors.Forbidden('Verification code expired')
      }

      if (user.verificationCode === (req as TokenRequest).token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden('Invalid verification code')
    }

    case 'passwordResetRequest': {
      const user = await getUserBy('email', (req as PasswordResetRequest).email)

      if (user) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.NotFound("Password reset request email doesn't exist")
    }

    case 'passwordResetToken': {
      const user = await getUserBy(
        'passwordResetCode',
        (req as TokenRequest).token,
      )

      if (!user || !user.passwordResetCode || !user.passwordResetExpires) {
        throw new Errors.BadRequest('Password reset data incomplete')
      }

      const expirationDate = new Date(user.passwordResetExpires)

      if (expirationDate < new Date()) {
        throw new Errors.Forbidden('Password reset code expired')
      }

      if (user.passwordResetCode === (req as TokenRequest).token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden('Invalid password reset code')
    }

    default: {
      throw new Error('Invalid validation type')
    }
  }
}
