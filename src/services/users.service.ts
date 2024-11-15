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
      try {
        const user = await getUserBy('email', (req as LoginRequest).email)

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

        throw new Errors.Unauthorized('Incorrect password')
      } catch (error) {
        console.error(error)

        if (
          error instanceof Error &&
          (error.message.includes('User does not exist') ||
            error.message.includes('Incorrect password'))
        ) {
          throw new Errors.Unauthorized()
        }

        throw error
      }
    }

    case 'registration': {
      try {
        await getUserBy('email', (req as RegisterRequest).email)
      } catch (error) {
        if (
          error instanceof Errors.DBError &&
          error.message.includes('User does not exist')
        ) {
          return req as ValidateReturnType[T]
        }

        throw new Error(
          error instanceof Error ? error.message : 'Unknown registration error',
        )
      }

      throw new Errors.BadRequest('Email already taken')
    }

    case 'verification': {
      const user = await getUserBy(
        'verificationToken',
        (req as TokenRequest).token,
      )

      if (!user.verificationToken || !user.verificationExpires) {
        throw new Errors.BadRequest('Verification data incomplete')
      }

      const expirationDate = new Date(user.verificationExpires)

      if (expirationDate < new Date()) {
        throw new Errors.Forbidden('Verification token expired')
      }

      if (user.verificationToken === (req as TokenRequest).token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden('Invalid verification token')
    }

    case 'passwordResetRequest': {
      const user = await getUserBy('email', (req as PasswordResetRequest).email)

      return { email: user.email } as ValidateReturnType[T]
    }

    case 'passwordResetToken': {
      const user = await getUserBy(
        'passwordResetToken',
        (req as TokenRequest).token,
      )

      if (!user.passwordResetToken || !user.passwordResetExpires) {
        throw new Errors.BadRequest('Password reset data incomplete')
      }

      const expirationDate = new Date(user.passwordResetExpires)

      if (expirationDate < new Date()) {
        throw new Errors.Forbidden('Password reset token expired')
      }

      if (user.passwordResetToken === (req as TokenRequest).token) {
        return { email: user.email } as ValidateReturnType[T]
      }

      throw new Errors.Forbidden('Invalid password reset token')
    }

    default: {
      throw new Error('Invalid validation type')
    }
  }
}
