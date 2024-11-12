import { getUserByEmail } from '../repository'
import { validateEmail, validatePassword } from '../utils'
import * as Error from '../errors'
import type {
  LoginRequest,
  RegisterRequest,
  VerificationRequest,
} from '../types'

export const validateLogin = async (
  req: LoginRequest,
): Promise<{ uuid: string }> => {
  const requiredFields = ['email', 'password']

  if (!requiredFields.every((key) => req[key as keyof LoginRequest]?.trim())) {
    throw new Error.BadRequest('Fields required')
  }

  if (!validateEmail(req.email)) {
    throw new Error.BadRequest('Invalid email format')
  }

  if (!validatePassword(req.password)) {
    throw new Error.BadRequest('Invalid password format')
  }

  const user = await getUserByEmail(req.email)

  if (!user) {
    throw new Error.NotFound()
  }

  if (!user.verified) {
    throw new Error.Forbidden('Email not verified')
  }

  const isPasswordCorrect = await Bun.password.verify(
    req.password,
    user.password,
  )

  if (isPasswordCorrect) {
    return { uuid: user.uuid }
  }

  throw new Error.Unauthorized()
}

export const validateRegistration = async (
  req: RegisterRequest,
): Promise<RegisterRequest> => {
  const requiredFields = ['email', 'password', 'firstName', 'lastName']

  if (
    !requiredFields.every((key) => req[key as keyof RegisterRequest]?.trim())
  ) {
    throw new Error.BadRequest('Fields required')
  }

  if (!validateEmail(req.email)) {
    throw new Error.BadRequest('Invalid email format')
  }

  if (!validatePassword(req.password)) {
    throw new Error.BadRequest('Invalid password format')
  }

  const isEmailTaken = await getUserByEmail(req.email)

  if (isEmailTaken) {
    throw new Error.BadRequest('Email already taken')
  }

  return req
}

export const validateVerification = async (
  req: VerificationRequest,
): Promise<{ email: string }> => {
  const requiredFields = ['email', 'code']

  if (!requiredFields.every((key) => req[key as keyof VerificationRequest])) {
    throw new Error.BadRequest('Fields required')
  }

  const userResponse = await getUserByEmail(req.email)

  if (
    !userResponse ||
    !userResponse.verificationCode ||
    !userResponse.verificationExpires
  ) {
    throw new Error.BadRequest('Verification data is incomplete.')
  }

  if (userResponse.verificationCode !== req.code) {
    throw new Error.Unauthorized('Invalid verification code.')
  }

  const expirationDate = new Date(userResponse.verificationExpires)

  if (expirationDate < new Date()) {
    throw new Error.Forbidden('Verification code has expired.')
  }

  return { email: userResponse.email }
}
