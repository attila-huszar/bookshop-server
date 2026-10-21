import { usersDB } from '@/repositories'
import {
  emailSchema,
  imageSchema,
  loginSchema,
  passwordResetSchema,
  profileUpdateSchema,
  registerSchema,
  tokenSchema,
  validate,
} from '@/validation'
import { signAccessToken, signRefreshToken, uploadFile } from '@/utils'
import { publicUserResponse } from '@/utils/response.utils'
import { authMessage, DUMMY_PASSWORD_HASH, userMessage } from '@/constants'
import { BadRequest, Forbidden, Internal, Unauthorized } from '@/errors'
import {
  Folder,
  type LoginRequest,
  type PasswordResetRequest,
  type PasswordResetSubmit,
  type PasswordResetToken,
  type ProfileUpdate,
  type PublicUser,
  type User,
  type UserRegistrationInsert,
  UserRole,
  type VerificationRequest,
} from '@/types'
import { AuthErrorCode, UserErrorCode } from '@/types/enums'

export async function loginUser(loginRequest: LoginRequest) {
  const { email, password } = validate(loginSchema, loginRequest)

  const user = await usersDB.getActiveUserBy('email', email)
  let isPasswordCorrect = false

  try {
    isPasswordCorrect = await Bun.password.verify(
      password,
      user ? user.password : DUMMY_PASSWORD_HASH,
    )
  } catch {
    // Treat malformed hashes as invalid credentials.
  }

  if (!user) {
    throw new Unauthorized(
      authMessage.credentialsInvalid,
      AuthErrorCode.InvalidCredentials,
    )
  }

  if (!user.verified) {
    throw new Forbidden(userMessage.verifyFirst, AuthErrorCode.EmailUnverified)
  }

  if (!isPasswordCorrect) {
    throw new Unauthorized(
      authMessage.credentialsInvalid,
      AuthErrorCode.InvalidCredentials,
    )
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

  const emailTaken = await usersDB.emailExists(email)

  if (emailTaken) {
    throw new BadRequest(
      userMessage.emailTaken,
      UserErrorCode.EmailAlreadyExists,
    )
  }

  const verificationToken = crypto.randomUUID()
  const verificationExpires = new Date(Date.now() + 86400000)

  const avatar =
    form.avatar instanceof File
      ? await uploadFile(form.avatar, Folder.Avatars)
      : null

  const newUser: UserRegistrationInsert = {
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
    address: null,
    phone: null,
    passwordResetToken: null,
    passwordResetExpires: null,
  }

  const userCreated = await usersDB.createUserWithVerification(newUser)

  if (!userCreated) {
    throw new Internal(userMessage.createFailed)
  }

  return { email: userCreated.email }
}

export async function verifyUser(verificationRequest: VerificationRequest) {
  const { token } = validate(tokenSchema, verificationRequest)

  const user = await usersDB.getActiveUserBy('verificationToken', token)

  if (!user?.verificationToken) {
    throw new BadRequest(authMessage.invalidToken, AuthErrorCode.InvalidToken)
  }

  const expiry = user.verificationExpires

  if (expiry && new Date(expiry) < new Date()) {
    throw new BadRequest(authMessage.invalidToken, AuthErrorCode.InvalidToken)
  }

  const userUpdated = await usersDB.updateUserBy('email', user.email, {
    verified: true,
    verificationToken: null,
    verificationExpires: null,
  })

  if (!userUpdated) {
    throw new Internal(userMessage.updateFailed)
  }

  return { email: userUpdated.email }
}

export async function passwordResetRequest(
  passwordResetRequest: PasswordResetRequest,
) {
  const { email } = validate(emailSchema, passwordResetRequest)

  const user = await usersDB.getActiveUserBy('email', email)

  if (!user) {
    return { message: userMessage.forgotPasswordRequest }
  }

  const passwordResetToken = crypto.randomUUID()
  const passwordResetExpires = new Date(Date.now() + 86400000)

  const userUpdated = await usersDB.setPasswordResetToken(user.uuid, {
    token: passwordResetToken,
    expiresAt: passwordResetExpires,
  })

  if (!userUpdated) {
    throw new Internal(userMessage.updateFailed)
  }

  return { message: userMessage.forgotPasswordRequest }
}

export async function passwordResetToken(
  passwordResetToken: PasswordResetToken,
) {
  const { token } = validate(tokenSchema, passwordResetToken)

  const user = await usersDB.getActiveUserBy('passwordResetToken', token)

  if (!user?.passwordResetToken) {
    throw new BadRequest(authMessage.invalidToken, AuthErrorCode.InvalidToken)
  }

  return { token }
}

export async function passwordResetSubmit(
  passwordResetSubmit: PasswordResetSubmit,
) {
  const { token, password } = validate(passwordResetSchema, passwordResetSubmit)

  const user = await usersDB.getActiveUserBy('passwordResetToken', token)
  const passwordResetExpiry = user?.passwordResetExpires

  if (
    !user ||
    !passwordResetExpiry ||
    new Date(passwordResetExpiry) <= new Date()
  ) {
    throw new Unauthorized(authMessage.invalidToken, AuthErrorCode.InvalidToken)
  }

  const userUpdated = await usersDB.updateUserBy('email', user.email, {
    password: await Bun.password.hash(password),
    passwordResetToken: null,
    passwordResetExpires: null,
  })

  if (!userUpdated) {
    throw new Internal(userMessage.updateFailed)
  }

  return { message: userMessage.passwordResetSuccess }
}

export async function getActiveUser(uuid: string): Promise<User>
export async function getActiveUser(
  uuid: string,
  options: { optional: true },
): Promise<User | null>
export async function getActiveUser(
  uuid: string,
  options?: { optional?: boolean },
): Promise<User | null> {
  const user = await usersDB.getActiveUserBy('uuid', uuid)

  if (!user) {
    if (options?.optional) {
      return null
    }

    throw new Unauthorized(authMessage.invalidToken, AuthErrorCode.InvalidToken)
  }

  return user
}

export async function updateUserProfile(
  user: Pick<User, 'uuid' | 'password'>,
  updateFields: ProfileUpdate,
): Promise<PublicUser> {
  const { currentPassword, ...validatedFields } = validate(
    profileUpdateSchema,
    updateFields,
  )

  if (validatedFields.password) {
    let isPasswordCorrect = false

    try {
      isPasswordCorrect = await Bun.password.verify(
        currentPassword!,
        user.password,
      )
    } catch {
      // Treat malformed hashes as invalid credentials.
    }

    if (!isPasswordCorrect) {
      throw new BadRequest(
        'Current password is incorrect',
        AuthErrorCode.CurrentPasswordIncorrect,
      )
    }

    validatedFields.password = await Bun.password.hash(validatedFields.password)
  }

  const userUpdated = await usersDB.updateUserBy(
    'uuid',
    user.uuid,
    validatedFields,
  )

  if (!userUpdated) {
    throw new Internal(userMessage.updateFailed)
  }

  return publicUserResponse(userUpdated)
}

export async function uploadUserAvatar(
  user: Pick<User, 'uuid'>,
  avatar: Bun.FormDataEntryValue | null,
): Promise<PublicUser> {
  if (!(avatar instanceof File)) {
    throw new BadRequest('Avatar must be a file', UserErrorCode.InvalidImage)
  }

  validate(imageSchema, avatar)

  const url = await uploadFile(avatar, Folder.Avatars)

  const userUpdated = await usersDB.updateUserBy('uuid', user.uuid, {
    avatar: url,
  })

  if (!userUpdated) {
    throw new Internal(userMessage.updateFailed)
  }

  return publicUserResponse(userUpdated)
}
