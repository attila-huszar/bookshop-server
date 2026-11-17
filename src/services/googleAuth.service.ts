import { OAuth2Client } from 'google-auth-library'
import { env } from '@/config/env'
import { createUserSession } from '@/services/users.service'
import { usersDB } from '@/repositories'
import {
  type GoogleIdentity,
  googleIdentitySchema,
  googleLoginSchema,
} from '@/validation/authSchemas'
import { authTiming } from '@/constants/auth'
import { BadRequest, Forbidden, Unauthorized } from '@/errors'
import { AuthErrorCode, UserErrorCode, UserRole } from '@/types/enums'
import type { UserInsert } from '@/types/users.types'

export const googleAuthClient = new OAuth2Client()

export function requireGoogleAuth(): string {
  const clientId = env.googleClientId

  if (!clientId) {
    throw new Forbidden('Google sign-in is not configured')
  }

  return clientId
}

export async function loginWithGoogle(request: unknown, sessionId: string) {
  const clientId = requireGoogleAuth()
  const { credential } = googleLoginSchema.parse(request)
  const identity = await verifyGoogleIdentity(credential, clientId)

  const isValidNonce = Bun.CSRF.verify(identity.nonce, {
    secret: env.cookieSecret!,
    sessionId,
    maxAge: authTiming.googleNonceMs,
  })

  if (!isValidNonce) {
    throw new Unauthorized(
      'Google sign-in challenge is invalid or expired',
      AuthErrorCode.InvalidToken,
    )
  }

  const linkedUser = await usersDB.getActiveUserBy(
    'googleSubject',
    identity.sub,
  )
  const user = linkedUser ?? (await linkOrCreateGoogleUser(identity))

  if (!user) {
    throw new Unauthorized(
      'Google account is unavailable',
      AuthErrorCode.InvalidCredentials,
    )
  }

  if (!user.verified) {
    throw new Forbidden(
      'Google account email needs verification',
      AuthErrorCode.EmailUnverified,
    )
  }

  return createUserSession(user)
}

async function verifyGoogleIdentity(credential: string, clientId: string) {
  try {
    const ticket = await googleAuthClient.verifyIdToken({
      idToken: credential,
      audience: clientId,
    })

    return googleIdentitySchema.parse(ticket.getPayload())
  } catch {
    // Provider errors can contain the submitted token; never forward or log them.
    throw new Unauthorized(
      'Google credential rejected',
      AuthErrorCode.InvalidCredentials,
    )
  }
}

async function linkOrCreateGoogleUser(identity: GoogleIdentity) {
  // Non-Google mailboxes need our own verification before private data access.
  const isGoogleManagedEmail =
    identity.email.endsWith('@gmail.com') || Boolean(identity.hd)
  const existing = await usersDB.getActiveUserBy('email', identity.email)

  if (
    existing &&
    (!existing.verified || existing.googleSubject || !isGoogleManagedEmail)
  ) {
    throw new BadRequest(
      'Google account cannot be linked automatically',
      UserErrorCode.EmailAlreadyExists,
    )
  }

  if (!existing && (await usersDB.emailExists(identity.email))) {
    throw new Forbidden(
      'Google account is unavailable',
      AuthErrorCode.AccountUnavailable,
    )
  }

  try {
    const user = existing
      ? await usersDB.linkGoogleAccount(existing.uuid, identity.sub)
      : await createGoogleUser(identity, isGoogleManagedEmail)

    if (user) {
      return user
    }
  } catch (error) {
    const conflictingField = usersDB.getUserIdentityConflict(error)

    if (!conflictingField) {
      throw error
    }

    // A concurrent first sign-in may have inserted or linked this identity.
    const user = await usersDB.getActiveUserBy('googleSubject', identity.sub)

    if (user) {
      return user
    }

    if (conflictingField === 'email') {
      throw new BadRequest(
        'Google account conflicts with an existing account',
        UserErrorCode.EmailAlreadyExists,
      )
    }

    // A soft-deleted account still reserves its Google subject.
    throw new Forbidden(
      'Google account is unavailable',
      AuthErrorCode.AccountUnavailable,
    )
  }

  // A concurrent link can also make the conditional update return no row.
  return usersDB.getActiveUserBy('googleSubject', identity.sub)
}

async function createGoogleUser(identity: GoogleIdentity, verified: boolean) {
  const values: UserInsert = {
    uuid: crypto.randomUUID(),
    googleSubject: identity.sub,
    email: identity.email,
    firstName: identity.given_name ?? identity.name ?? 'User',
    lastName: identity.family_name ?? '',
    country: 'hu',
    role: UserRole.User,
    verified,
    password: null,
    avatar: null,
    address: null,
    phone: null,
    verificationToken: null,
    verificationExpires: null,
    passwordResetToken: null,
    passwordResetExpires: null,
  }

  if (verified) {
    return usersDB.createUser(values)
  }

  return usersDB.createUserWithVerification({
    ...values,
    verified: false,
    verificationToken: crypto.randomUUID(),
    verificationExpires: new Date(Date.now() + authTiming.verificationMs),
  })
}
