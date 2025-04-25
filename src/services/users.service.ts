import { usersDB } from '../repositories'
import {
  validate,
  loginSchema,
  registerSchema,
  verificationSchema,
  passwordResetRequestSchema,
  passwordResetTokenSchema,
} from '../validation'
import { env } from '../config'
import { sendEmail } from '../libs'
import { signAccessToken, signRefreshToken, uploadFile } from '../utils'
import { authMessage, userMessage } from '../constants'
import { BadRequest, Forbidden, Unauthorized } from '../errors'
import type {
  LoginRequest,
  PasswordResetRequest,
  TokenRequest,
  UserUpdateRequest,
} from '../types'

export async function loginUser(loginRequest: LoginRequest) {
  const validationResult = validate(loginSchema, loginRequest)

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const validatedData = validationResult.data
  const user = await usersDB.getUserBy('email', validatedData.email)

  if (!user) {
    throw new Unauthorized(authMessage.authError)
  }

  if (!user.verified) {
    throw new Forbidden(userMessage.verifyFirst)
  }

  const isPasswordCorrect = await Bun.password.verify(
    validatedData.password,
    user.password,
  )

  if (!isPasswordCorrect) {
    throw new Unauthorized(authMessage.authError)
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const accessToken = await signAccessToken(user.uuid, timestamp)
  const refreshToken = await signRefreshToken(user.uuid, timestamp)

  return { accessToken, refreshToken, firstName: user.firstName }
}

export async function registerUser(formData: FormData) {
  const data = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    password: formData.get('password'),
    avatar: formData.get('avatar'),
  }

  const validationResult = validate(registerSchema, data)

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const validatedRequest = validationResult.data
  const existingUser = await usersDB.getUserBy('email', validatedRequest.email)

  if (existingUser) {
    throw new BadRequest(userMessage.emailTaken)
  }

  const verificationToken = crypto.randomUUID()
  const verificationExpires = new Date(Date.now() + 86400000).toISOString()
  const tokenLink = `${env.clientBaseUrl}/verification?token=${verificationToken}`

  const emailResponse = await sendEmail({
    toAddress: validatedRequest.email,
    toName: validatedRequest.firstName,
    tokenLink,
    baseLink: env.clientBaseUrl!,
    type: 'verification',
  })

  if (!emailResponse.accepted.includes(validatedRequest.email))
    throw new Error(userMessage.sendEmail)

  const avatarUrl =
    validatedRequest.avatar instanceof File
      ? await uploadFile(validatedRequest.avatar)
      : null

  const newUser = {
    ...validatedRequest,
    uuid: crypto.randomUUID(),
    role: 'user' as const,
    avatar: avatarUrl,
    verificationToken,
    verificationExpires,
  }

  const userCreated = await usersDB.createUser(newUser)

  if (!userCreated) {
    throw new Error(userMessage.createError)
  }

  return { email: userCreated.email }
}

export async function verifyUser(verificationRequest: TokenRequest) {
  const validationResult = validate(verificationSchema, verificationRequest)

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const { token } = validationResult.data
  const user = await usersDB.getUserBy('verificationToken', token)

  if (!user?.verificationToken || !user.verificationExpires) {
    throw new BadRequest(authMessage.invalidToken)
  }

  const expirationDate = new Date(user.verificationExpires)

  if (expirationDate < new Date()) {
    throw new Forbidden(authMessage.expiredToken)
  }

  const userUpdated = await usersDB.updateUser(user.email, {
    verified: true,
    verificationToken: null,
    verificationExpires: null,
    updatedAt: new Date().toISOString(),
  })

  if (!userUpdated) {
    throw new Error(userMessage.updateError)
  }

  return { email: userUpdated.email }
}

export async function passwordResetRequestService(
  passwordResetRequest: PasswordResetRequest,
) {
  const validationResult = validate(
    passwordResetRequestSchema,
    passwordResetRequest,
  )

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const { email } = validationResult.data
  const user = await usersDB.getUserBy('email', email)

  if (!user) {
    return { message: userMessage.forgotPasswordRequest }
  }

  const passwordResetToken = crypto.randomUUID()
  const passwordResetExpires = new Date(Date.now() + 86400000).toISOString()
  const tokenLink = `${env.clientBaseUrl}/password-reset?token=${passwordResetToken}`

  const emailResponse = await sendEmail({
    toAddress: user.email,
    toName: user.firstName,
    tokenLink,
    baseLink: env.clientBaseUrl!,
    type: 'passwordReset',
  })

  if (!emailResponse.accepted.includes(user.email)) {
    throw new Error(userMessage.sendEmail)
  }

  const userUpdated = await usersDB.updateUser(user.email, {
    passwordResetToken,
    passwordResetExpires,
    updatedAt: new Date().toISOString(),
  })

  if (!userUpdated) {
    throw new Error(userMessage.updateError)
  }

  return { message: userMessage.forgotPasswordRequest }
}

export async function passwordResetTokenService(
  passwordResetTokenRequest: TokenRequest,
) {
  const validationResult = validate(
    passwordResetTokenSchema,
    passwordResetTokenRequest,
  )

  if (validationResult.error) {
    return { error: validationResult.error }
  }

  const { token, password } = validationResult.data
  const user = await usersDB.getUserBy('passwordResetToken', token)

  if (!user?.passwordResetToken || !user.passwordResetExpires) {
    throw new BadRequest(authMessage.invalidToken)
  }

  const expirationDate = new Date(user.passwordResetExpires)

  if (expirationDate < new Date()) {
    throw new Forbidden(authMessage.expiredToken)
  }

  const hashedPassword = await Bun.password.hash(password)
  const userUpdated = await usersDB.updateUser(user.email, {
    password: hashedPassword,
    passwordResetToken: null,
    passwordResetExpires: null,
    updatedAt: new Date().toISOString(),
  })

  if (!userUpdated) {
    throw new Error(userMessage.updateError)
  }

  return { email: userUpdated.email }
}

export async function getUserProfile(uuid: string) {
  const user = await usersDB.getUserBy('uuid', uuid)

  if (!user) {
    throw new Error(userMessage.retrieveError)
  }

  const {
    id,
    uuid: _uuid,
    password,
    verified,
    verificationToken,
    verificationExpires,
    passwordResetToken,
    passwordResetExpires,
    createdAt,
    updatedAt,
    ...userWithoutCreds
  } = user

  return userWithoutCreds
}

export async function updateUserProfile(
  uuid: string,
  updateFields: UserUpdateRequest,
) {
  const user = await usersDB.getUserBy('uuid', uuid)

  if (!user) {
    throw new Error(userMessage.retrieveError)
  }

  const userUpdated = await usersDB.updateUser(user.email, {
    ...updateFields,
    updatedAt: new Date().toISOString(),
  })

  if (!userUpdated) {
    throw new Error(userMessage.updateError)
  }

  const {
    id,
    uuid: _uuid,
    password,
    verified,
    verificationToken,
    verificationExpires,
    passwordResetToken,
    passwordResetExpires,
    createdAt,
    updatedAt,
    ...userWithoutCreds
  } = userUpdated

  return userWithoutCreds
}
