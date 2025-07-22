import { usersDB } from '@/repositories'
import {
  validate,
  loginSchema,
  registerSchema,
  emailSchema,
  tokenSchema,
  passwordResetSchema,
} from '@/validation'
import { env } from '@/config'
import { log } from '@/libs'
import { signAccessToken, signRefreshToken, uploadFile } from '@/utils'
import { emailQueue } from '@/queues'
import { authMessage, jobOpts, QUEUE, userMessage } from '@/constants'
import { BadRequest, Forbidden, Unauthorized } from '@/errors'
import {
  type LoginRequest,
  type VerificationRequest,
  type PasswordResetRequest,
  type PasswordResetToken,
  type PasswordResetSubmit,
  type UserUpdateRequest,
  type SendEmailProps,
  UserRole,
} from '@/types'

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

  const { firstName, lastName, email, password } = validate(
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

  const avatarUrl =
    form.avatar instanceof File ? await uploadFile(form.avatar) : null

  const newUser = {
    uuid: crypto.randomUUID(),
    firstName,
    lastName,
    email,
    password: await Bun.password.hash(password),
    avatar: avatarUrl,
    role: UserRole.User,
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

  void emailQueue
    .add(
      QUEUE.EMAIL.JOB.VERIFICATION,
      {
        type: QUEUE.EMAIL.JOB.VERIFICATION,
        toAddress: email,
        toName: firstName,
        tokenLink,
      } satisfies SendEmailProps,
      jobOpts,
    )
    .catch((error: Error) => {
      void log.error(
        '[QUEUE] Failed to queue registration verification email',
        { error },
      )
    })

  return { email: userCreated.email }
}

export async function verifyUser(verificationRequest: VerificationRequest) {
  const { token } = validate(tokenSchema, verificationRequest)

  const user = await usersDB.getUserBy('verificationToken', token)

  if (!user?.verificationToken) {
    throw new BadRequest(authMessage.invalidToken)
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

export async function passwordResetRequest(
  passwordResetRequest: PasswordResetRequest,
) {
  const { email } = validate(emailSchema, passwordResetRequest)

  const user = await usersDB.getUserBy('email', email)

  if (!user) {
    return { message: userMessage.forgotPasswordRequest }
  }

  const passwordResetToken = crypto.randomUUID()
  const passwordResetExpires = new Date(Date.now() + 86400000).toISOString()
  const tokenLink = `${env.clientBaseUrl}/password-reset?token=${passwordResetToken}`

  const userUpdated = await usersDB.updateUser(user.email, {
    passwordResetToken,
    passwordResetExpires,
    updatedAt: new Date().toISOString(),
  })

  if (!userUpdated) {
    throw new Error(userMessage.updateError)
  }

  void emailQueue
    .add(
      QUEUE.EMAIL.JOB.PASSWORD_RESET,
      {
        type: QUEUE.EMAIL.JOB.PASSWORD_RESET,
        toAddress: user.email,
        toName: user.firstName,
        tokenLink,
      } satisfies SendEmailProps,
      jobOpts,
    )
    .catch((error: Error) => {
      void log.error('[QUEUE] Failed to queue password reset email', {
        error,
      })
    })

  return { message: userMessage.forgotPasswordRequest }
}

export async function passwordResetToken(
  passwordResetToken: PasswordResetToken,
) {
  const { token } = validate(tokenSchema, passwordResetToken)

  const user = await usersDB.getUserBy('passwordResetToken', token)

  if (!user?.passwordResetToken) {
    throw new BadRequest(authMessage.invalidToken)
  }

  return { token }
}

export async function passwordResetSubmit(
  passwordResetSubmit: PasswordResetSubmit,
) {
  const { token, password } = validate(passwordResetSchema, passwordResetSubmit)

  const user = await usersDB.getUserBy('passwordResetToken', token)

  if (!user) {
    throw new Error(userMessage.retrieveError)
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

  return { message: userMessage.passwordResetSuccess }
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

  if (updateFields.password) {
    updateFields.password = await Bun.password.hash(updateFields.password)
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
