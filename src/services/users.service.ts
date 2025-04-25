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
  const { email, password } = validate(loginSchema, loginRequest)

  const user = await usersDB.getUserBy('email', email)

  if (!user) {
    throw new Unauthorized(authMessage.authError)
  }

  if (!user.verified) {
    throw new Forbidden(userMessage.verifyFirst)
  }

  const isPasswordCorrect = await Bun.password.verify(password, user.password)

  if (!isPasswordCorrect) {
    throw new Unauthorized(authMessage.authError)
  }

  const timestamp = Math.floor(Date.now() / 1000)
  const accessToken = await signAccessToken(user.uuid, timestamp)
  const refreshToken = await signRefreshToken(user.uuid, timestamp)

  return { accessToken, refreshToken, firstName: user.firstName }
}

export async function registerUser(formData: FormData) {
  const form = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email'),
    password: formData.get('password'),
    avatar: formData.get('avatar'),
  }

  const { firstName, lastName, email, password, avatar } = validate(
    registerSchema,
    form,
  )

  const existingUser = await usersDB.getUserBy('email', email)

  if (existingUser) {
    throw new BadRequest(userMessage.emailTaken)
  }

  const verificationToken = crypto.randomUUID()
  const verificationExpires = new Date(Date.now() + 86400000).toISOString()
  const tokenLink = `${env.clientBaseUrl}/verification?token=${verificationToken}`

  const emailResponse = await sendEmail({
    toAddress: email,
    toName: firstName,
    tokenLink,
    baseLink: env.clientBaseUrl!,
    type: 'verification',
  })

  if (!emailResponse.accepted.includes(email))
    throw new Error(userMessage.sendEmail)

  const avatarUrl = avatar ? await uploadFile(avatar) : null

  const newUser = {
    uuid: crypto.randomUUID(),
    firstName,
    lastName,
    email,
    password: await Bun.password.hash(password),
    avatar: avatarUrl,
    role: 'user' as const,
    verified: false,
    verificationToken,
    verificationExpires,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const userCreated = await usersDB.createUser(newUser)

  if (!userCreated) {
    throw new Error(userMessage.createError)
  }

  return { email: userCreated.email }
}

export async function verifyUser(verificationRequest: TokenRequest) {
  const { token } = validate(verificationSchema, verificationRequest)

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
  const { email } = validate(passwordResetRequestSchema, passwordResetRequest)

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
  const { token, password } = validate(
    passwordResetTokenSchema,
    passwordResetTokenRequest,
  )

  const user = await usersDB.getUserBy('passwordResetToken', token)

  if (!user?.passwordResetToken || !user.passwordResetExpires) {
    throw new BadRequest(authMessage.invalidToken)
  }

  const expirationDate = new Date(user.passwordResetExpires)

  if (expirationDate < new Date()) {
    throw new Forbidden(authMessage.expiredToken)
  }

  const userUpdated = await usersDB.updateUser(user.email, {
    password: await Bun.password.hash(password),
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
