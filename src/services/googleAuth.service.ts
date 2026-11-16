import { OAuth2Client } from 'google-auth-library'
import { z } from 'zod'
import { env } from '@/config/env'
import { createUserSession } from '@/services/users.service'
import { usersDB } from '@/repositories'
import { emailSchema } from '@/validation/authSchemas'
import { authTiming } from '@/constants/auth'
import { BadRequest, Forbidden, Unauthorized } from '@/errors'
import { AuthErrorCode, UserErrorCode, UserRole } from '@/types/enums'
import type { UserInsert } from '@/types/users.types'

export const googleAuthClient = new OAuth2Client()

const googleLoginSchema = z.strictObject({
  credential: z.string().min(1).max(10_000),
})

const googleIdentitySchema = z.object({
  sub: z.string().min(1).max(255),
  ...emailSchema.shape,
  email_verified: z.literal(true),
  nonce: z.string().min(1),
  hd: z.string().optional(),
  given_name: z.string().trim().min(1).max(100).optional(),
  family_name: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(100).optional(),
})

type GoogleIdentity = z.infer<typeof googleIdentitySchema>

export function requireGoogleAuth(): void {
  if (!env.googleClientId) {
    throw new Forbidden('Google sign-in is not configured')
  }
}

export async function loginWithGoogle(request: unknown, sessionId: string) {
  requireGoogleAuth()
  const { credential } = googleLoginSchema.parse(request)
  let identity: GoogleIdentity

  try {
    const ticket = await googleAuthClient.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    })
    identity = googleIdentitySchema.parse(ticket.getPayload())
  } catch {
    // Provider errors can contain the submitted token; never forward or log them.
    throw new Unauthorized(
      'Google credential rejected',
      AuthErrorCode.InvalidCredentials,
    )
  }

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

  let user = await usersDB.getActiveUserBy('googleSubject', identity.sub)

  if (!user) {
    // Non-Google mailboxes need our own verification before private data access.
    const ownsEmail =
      identity.email.endsWith('@gmail.com') || Boolean(identity.hd)
    const existing = await usersDB.getActiveUserBy('email', identity.email)

    if (existing) {
      const cannotLink =
        !existing.verified || Boolean(existing.googleSubject) || !ownsEmail

      if (cannotLink) {
        throw new BadRequest(
          'Google account cannot be linked automatically',
          UserErrorCode.EmailAlreadyExists,
        )
      }
    } else if (await usersDB.emailExists(identity.email)) {
      throw new Unauthorized(
        'Account is unavailable',
        AuthErrorCode.InvalidCredentials,
      )
    }

    try {
      user = existing
        ? await usersDB.linkGoogleAccount(existing.uuid, identity.sub)
        : await createGoogleUser(identity, ownsEmail)
    } catch (error) {
      // A concurrent first sign-in may have inserted or linked this identity.
      user = await usersDB.getActiveUserBy('googleSubject', identity.sub)

      if (!user) {
        // A different identity may have won the unique email/subject constraint.
        if (await usersDB.emailExists(identity.email)) {
          throw new BadRequest(
            'Google account conflicts with an existing account',
            UserErrorCode.EmailAlreadyExists,
          )
        }

        throw error
      }
    }

    user ??= await usersDB.getActiveUserBy('googleSubject', identity.sub)
  }

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
