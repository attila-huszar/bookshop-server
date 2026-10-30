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
import { DUMMY_PASSWORD_HASH } from '@/constants'
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

  if (!user || !isPasswordCorrect) {
    throw new Unauthorized(
      'Login rejected: invalid credentials',
      AuthErrorCode.InvalidCredentials,
    )
  }

  if (!user.verified) {
    throw new Forbidden(
      'Login rejected: email is not verified',
      AuthErrorCode.EmailUnverified,
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
      'Registration rejected: email already exists',
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
    throw new Internal('Registration failed: user insert returned no record')
  }

  return { email: userCreated.email }
}

export async function verifyUser(verificationRequest: VerificationRequest) {
  const { token } = validate(tokenSchema, verificationRequest)

  const userUpdated = await usersDB.verifyUserByToken(token)

  if (!userUpdated) {
    throw new BadRequest(
      'Email verification rejected: token could not be consumed',
      AuthErrorCode.InvalidToken,
    )
  }

  return { email: userUpdated.email }
}

export async function passwordResetRequest(
  passwordResetRequest: PasswordResetRequest,
): Promise<void> {
  const { email } = validate(emailSchema, passwordResetRequest)

  const user = await usersDB.getActiveUserBy('email', email)

  if (!user) {
    return
  }

  const passwordResetToken = crypto.randomUUID()
  const passwordResetExpires = new Date(Date.now() + 86400000)

  const userUpdated = await usersDB.setPasswordResetToken(user.uuid, {
    token: passwordResetToken,
    expiresAt: passwordResetExpires,
  })

  if (!userUpdated) {
    throw new Internal(
      'Password reset request failed: token update returned no active user',
    )
  }
}

export async function passwordResetToken(
  passwordResetToken: PasswordResetToken,
) {
  const { token } = validate(tokenSchema, passwordResetToken)

  await validatePasswordResetToken(token)

  return { token }
}

export async function passwordResetSubmit(
  passwordResetSubmit: PasswordResetSubmit,
): Promise<void> {
  const { token, password } = validate(passwordResetSchema, passwordResetSubmit)

  await validatePasswordResetToken(token)

  const userUpdated = await usersDB.resetPasswordByToken(
    token,
    await Bun.password.hash(password),
  )

  if (!userUpdated) {
    throw new BadRequest(
      'Password reset rejected: token could not be consumed',
      AuthErrorCode.InvalidToken,
    )
  }
}

/** Preview and submission use the same expiry check; the write rechecks it atomically. */
async function validatePasswordResetToken(token: string): Promise<void> {
  const user = await usersDB.getActiveUserBy('passwordResetToken', token)
  const expiresAt = user?.passwordResetExpires?.getTime() ?? 0

  if (!user?.passwordResetToken || !(expiresAt > Date.now())) {
    throw new BadRequest(
      'Password reset token validation failed: token is invalid or expired',
      AuthErrorCode.InvalidToken,
    )
  }
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

    throw new Unauthorized(
      'Authentication rejected: active user not found',
      AuthErrorCode.InvalidToken,
    )
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
    throw new Internal(
      'Profile update failed: user update returned no active user',
    )
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
    throw new Internal(
      'Avatar update failed: user update returned no active user',
    )
  }

  return publicUserResponse(userUpdated)
}
