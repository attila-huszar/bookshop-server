import { env } from '@/config'
import { usersDB } from '@/repositories'
import {
  emailSchema,
  imageSchema,
  loginSchema,
  passwordResetSchema,
  registerSchema,
  tokenSchema,
  userUpdateSchema,
  validate,
} from '@/validation'
import { Folder, signAccessToken, signRefreshToken, uploadFile } from '@/utils'
import { log } from '@/libs'
import { emailQueue } from '@/queues'
import { authMessage, jobOpts, QUEUE, userMessage } from '@/constants'
import { BadRequest, Forbidden, NotFound, Unauthorized } from '@/errors'
import {
  type LoginRequest,
  type PasswordResetRequest,
  type PasswordResetSubmit,
  type PasswordResetToken,
  type SendEmailProps,
  type UserInsert,
  UserRole,
  type UserUpdate,
  type VerificationRequest,
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
    country: formData.get('country'),
    avatar: formData.get('avatar'),
  }

  const { firstName, lastName, email, password, country } = validate(
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

  const avatar =
    form.avatar instanceof File
      ? await uploadFile(form.avatar, Folder.Avatars)
      : ''

  const newUser: UserInsert = {
    uuid: crypto.randomUUID(),
    firstName,
    lastName,
    email,
    password: await Bun.password.hash(password),
    avatar,
    country,
    role: UserRole.User,
    verified: false,
    verificationToken,
    verificationExpires,
    address: {
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: '',
    },
    phone: '',
    passwordResetToken: '',
    passwordResetExpires: '',
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

  const now = new Date().toISOString()
  if (user.verificationExpires && user.verificationExpires < now) {
    throw new BadRequest(authMessage.invalidToken)
  }

  const userUpdated = await usersDB.updateUserBy('email', user.email, {
    verified: true,
    verificationToken: '',
    verificationExpires: '',
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

  const userUpdated = await usersDB.updateUserBy('email', user.email, {
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
    throw new NotFound(userMessage.getError)
  }

  const userUpdated = await usersDB.updateUserBy('email', user.email, {
    password: await Bun.password.hash(password),
    passwordResetToken: '',
    passwordResetExpires: '',
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
    throw new NotFound(userMessage.getError)
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
  updateFields: UserUpdate,
) {
  const validatedFields = validate(userUpdateSchema, updateFields)

  const user = await usersDB.getUserBy('uuid', uuid)

  if (!user) {
    throw new NotFound(userMessage.getError)
  }

  if (validatedFields.password) {
    validatedFields.password = await Bun.password.hash(validatedFields.password)
  }

  const userUpdated = await usersDB.updateUserBy('email', user.email, {
    ...validatedFields,
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

export async function uploadUserAvatar(
  userUuid: string,
  avatar: Bun.FormDataEntryValue | null,
) {
  const user = await usersDB.getUserBy('uuid', userUuid)

  if (!user) {
    throw new NotFound(userMessage.getError)
  }

  if (!(avatar instanceof File)) {
    throw new BadRequest('Avatar must be a file')
  }

  validate(imageSchema, avatar)

  const url = await uploadFile(avatar, Folder.Avatars)

  const userUpdated = await usersDB.updateUserBy('email', user.email, {
    avatar: url,
    updatedAt: new Date().toISOString(),
  })

  if (!userUpdated) {
    throw new Error(userMessage.updateError)
  }

  const {
    id,
    uuid,
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
