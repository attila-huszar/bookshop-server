import { getUserByEmail } from '../repository'
import { validateEmail, validatePassword } from '../utils'
import * as Errors from '../errors'
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
    throw new Errors.BadRequest('Fields required')
  }

  if (!validateEmail(req.email)) {
    throw new Errors.BadRequest('Invalid email format')
  }

  if (!validatePassword(req.password)) {
    throw new Errors.BadRequest('Invalid password format')
  }

  const user = await getUserByEmail(req.email)

  if (!user) {
    throw new Errors.NotFound()
  }

  if (!user.verified) {
    throw new Errors.Forbidden('Email not verified')
  }

  const isPasswordCorrect = await Bun.password.verify(
    req.password,
    user.password,
  )

  if (isPasswordCorrect) {
    return { uuid: user.uuid }
  }

  throw new Errors.Unauthorized()
}

export const validateRegistration = async (
  req: RegisterRequest,
): Promise<RegisterRequest> => {
  const requiredFields = ['email', 'password', 'firstName', 'lastName']

  if (
    !requiredFields.every((key) => req[key as keyof RegisterRequest]?.trim())
  ) {
    throw new Errors.BadRequest('Fields required')
  }

  if (!validateEmail(req.email)) {
    throw new Errors.BadRequest('Invalid email format')
  }

  if (!validatePassword(req.password)) {
    throw new Errors.BadRequest('Invalid password format')
  }

  const isEmailTaken = await getUserByEmail(req.email)

  if (isEmailTaken) {
    throw new Errors.BadRequest('Email already taken')
  }

  return req
}

export const validateVerification = async (
  req: VerificationRequest,
): Promise<{ email: string }> => {
  const requiredFields = ['email', 'code']

  if (!requiredFields.every((key) => req[key as keyof VerificationRequest])) {
    throw new Errors.BadRequest('Fields required')
  }

  const userResponse = await getUserByEmail(req.email)

  if (
    !userResponse ||
    !userResponse.verificationCode ||
    !userResponse.verificationExpires
  ) {
    throw new Errors.BadRequest('Verification data incomplete')
  }

  if (userResponse.verificationCode !== req.code) {
    throw new Errors.Unauthorized('Invalid verification code')
  }

  const expirationDate = new Date(userResponse.verificationExpires)

  if (expirationDate < new Date()) {
    throw new Errors.Forbidden('Verification code expired')
  }

  return { email: userResponse.email }
}
