import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { rejects } from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { CertificateFormat } from 'google-auth-library/build/src/auth/oauth2client'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import {
  env,
  GOOGLE_AUTH_SESSION,
  googleCookieOptions,
  REFRESH_TOKEN,
} from '@/config'
import { users } from '@/controller/users.controller'
import {
  googleAuthClient,
  loginWithGoogle,
} from '@/services/googleAuth.service'
import { authTiming } from '@/constants/auth'
import { API } from '@/constants/paths'
import { errorHandler } from '@/errors/errorHandler'
import {
  mockSignAccessToken,
  mockSignRefreshToken,
  mockUsersDB,
} from './test-setup'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
})
const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .route('/', users)
const originalClientId = env.googleClientId
const originalCookieSecret = env.cookieSecret
const origin = env.clientBaseUrl!
const subject = 'google-account-123'
const account = {
  uuid: '11111111-1111-4111-8111-111111111111',
  googleSubject: subject,
  email: 'reader@gmail.com',
  firstName: 'Reader',
  verified: true,
}
let certificates: ReturnType<
  typeof spyOn<typeof googleAuthClient, 'getFederatedSignonCertsAsync'>
>

function credential(sessionId: string, claims: Record<string, unknown> = {}) {
  const timestamp = Math.floor(Date.now() / 1000)
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
  ).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: env.googleClientId,
      iat: timestamp,
      exp: timestamp + 3600,
      sub: subject,
      email: account.email,
      email_verified: true,
      given_name: 'Reader',
      nonce: Bun.CSRF.generate(env.cookieSecret, {
        sessionId,
        expiresIn: authTiming.googleNonceMs,
      }),
      ...claims,
    }),
  ).toString('base64url')
  const contents = `${header}.${payload}`

  return `${contents}.${sign('RSA-SHA256', Buffer.from(contents), privateKey).toString('base64url')}`
}

beforeEach(() => {
  env.googleClientId = 'bookshop-test.apps.googleusercontent.com'
  env.cookieSecret = 'google-test-cookie-secret'
  for (const mock of [
    mockUsersDB.getActiveUserBy,
    mockUsersDB.emailExists,
    mockUsersDB.createUser,
    mockUsersDB.linkGoogleAccount,
    mockUsersDB.createUserWithVerification,
  ]) {
    mock.mockReset()
  }
  mockSignAccessToken.mockReset().mockResolvedValue('bookshop-access')
  mockSignRefreshToken.mockReset().mockResolvedValue('bookshop-refresh')
  mockUsersDB.getActiveUserBy.mockResolvedValue(null)
  mockUsersDB.emailExists.mockResolvedValue(false)
  mockUsersDB.createUser.mockResolvedValue(account)
  certificates = spyOn(
    googleAuthClient,
    'getFederatedSignonCertsAsync',
  ).mockResolvedValue({
    certs: {
      'test-key': publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    },
    format: CertificateFormat.PEM,
  })
})

afterEach(() => {
  certificates.mockRestore()
  env.googleClientId = originalClientId
  env.cookieSecret = originalCookieSecret
})

describe('Google identity verification and accounts', () => {
  it('creates a verified passwordless Gmail user and issues bookshop tokens', async () => {
    const result = await loginWithGoogle(
      { credential: credential('nonce') },
      'nonce',
    )

    expect(result).toEqual({
      accessToken: 'bookshop-access',
      refreshToken: 'bookshop-refresh',
      firstName: 'Reader',
    })
    expect(mockUsersDB.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        googleSubject: subject,
        email: account.email,
        password: null,
        role: 'user',
        verified: true,
      }),
    )
    expect(mockUsersDB.createUserWithVerification).not.toHaveBeenCalled()
  })

  it.each([
    { aud: 'another-client' },
    { iss: 'https://attacker.example' },
    { exp: Math.floor(Date.now() / 1000) - 3600 },
    { nonce: '' },
    { email_verified: false },
    { sub: '' },
  ])('rejects invalid claims before touching accounts: %j', async (claims) => {
    await rejects(
      loginWithGoogle({ credential: credential('nonce', claims) }, 'nonce'),
      { code: 'INVALID_CREDENTIALS' },
    )
    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
    expect(mockSignAccessToken).not.toHaveBeenCalled()
  })

  it('rejects a tampered signature', async () => {
    const token = credential('nonce')
    const signatureIndex = token.lastIndexOf('.') + 1
    const tampered = `${token.slice(0, signatureIndex)}${token[signatureIndex] === 'A' ? 'B' : 'A'}${token.slice(signatureIndex + 1)}`
    await rejects(loginWithGoogle({ credential: tampered }, 'nonce'), {
      code: 'INVALID_CREDENTIALS',
    })
    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
  })

  it.each(['malformed-nonce'])(
    'rejects a malformed nonce before touching accounts: %s',
    async (nonce) => {
      await rejects(
        loginWithGoogle(
          { credential: credential('browser-session', { nonce }) },
          'browser-session',
        ),
        { code: 'INVALID_TOKEN' },
      )
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
      expect(mockSignAccessToken).not.toHaveBeenCalled()
    },
  )

  it('uses the saved subject identity even when Google changes the email', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(account)
    await loginWithGoogle(
      { credential: credential('nonce', { email: 'changed@gmail.com' }) },
      'nonce',
    )

    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith(
      'googleSubject',
      subject,
    )
    expect(mockUsersDB.createUser).not.toHaveBeenCalled()
    expect(mockUsersDB.linkGoogleAccount).not.toHaveBeenCalled()
    expect(mockSignAccessToken).toHaveBeenCalledWith(
      account.uuid,
      expect.any(Number),
    )
  })

  it.each([
    { email: 'reader@gmail.com' },
    { email: 'reader@workspace.example', hd: 'workspace.example' },
  ])(
    'links a verified existing account when Google owns the mailbox: %j',
    async (claims) => {
      mockUsersDB.getActiveUserBy
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...account, googleSubject: null })
      mockUsersDB.linkGoogleAccount.mockResolvedValueOnce(account)
      await loginWithGoogle(
        { credential: credential('nonce', claims) },
        'nonce',
      )

      expect(mockUsersDB.linkGoogleAccount).toHaveBeenCalledTimes(1)
      expect(mockUsersDB.linkGoogleAccount).toHaveBeenCalledWith(
        account.uuid,
        subject,
      )
      expect(mockUsersDB.createUser).not.toHaveBeenCalled()
    },
  )

  it.each([
    { verified: false, googleSubject: null, email: account.email },
    {
      verified: true,
      googleSubject: 'different-subject',
      email: account.email,
    },
    { verified: true, googleSubject: null, email: 'reader@example.com' },
  ])('rejects unsafe account linking: %j', async (existing) => {
    mockUsersDB.getActiveUserBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...account, ...existing })
    await rejects(
      loginWithGoogle(
        { credential: credential('nonce', { email: existing.email }) },
        'nonce',
      ),
      { code: 'EMAIL_ALREADY_EXISTS' },
    )
    expect(mockUsersDB.linkGoogleAccount).not.toHaveBeenCalled()
    expect(mockSignAccessToken).not.toHaveBeenCalled()
  })

  it('requires our verification email for a new third-party mailbox', async () => {
    mockUsersDB.createUserWithVerification.mockResolvedValueOnce({
      ...account,
      verified: false,
    })
    await rejects(
      loginWithGoogle(
        { credential: credential('nonce', { email: 'reader@example.com' }) },
        'nonce',
      ),
      { code: 'EMAIL_UNVERIFIED' },
    )
    expect(mockUsersDB.createUserWithVerification).toHaveBeenCalledWith(
      expect.objectContaining({
        googleSubject: subject,
        verified: false,
        password: null,
      }),
    )
    expect(mockSignAccessToken).not.toHaveBeenCalled()
  })

  it('keeps deleted emails reserved', async () => {
    mockUsersDB.emailExists.mockResolvedValueOnce(true)
    await rejects(
      loginWithGoogle({ credential: credential('nonce') }, 'nonce'),
      { code: 'INVALID_CREDENTIALS' },
    )
    expect(mockUsersDB.createUser).not.toHaveBeenCalled()
  })

  it('recovers a concurrent insertion by subject', async () => {
    mockUsersDB.getActiveUserBy
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(account)
    mockUsersDB.createUser.mockRejectedValueOnce(new Error('Unique constraint'))
    expect(
      await loginWithGoogle({ credential: credential('nonce') }, 'nonce'),
    ).toMatchObject({ accessToken: 'bookshop-access' })
  })

  it('fails closed when Google sign-in is disabled', async () => {
    env.googleClientId = ''
    await rejects(loginWithGoogle({ credential: 'anything' }, 'nonce'), {
      status: 403,
    })
    expect(certificates).not.toHaveBeenCalled()
  })
})

describe('Google browser session boundary', () => {
  async function challengeCookie(sessionId: string) {
    const issuer = new Hono().get('/', async (c) => {
      await setSignedCookie(
        c,
        GOOGLE_AUTH_SESSION,
        sessionId,
        env.cookieSecret!,
        googleCookieOptions,
      )

      return c.text('')
    })
    const response = await issuer.request('/')

    return response.headers.get('set-cookie')!.split(';')[0]!
  }

  it('issues a short-lived HttpOnly challenge and exchanges it for the regular session', async () => {
    const challenge = await app.request(API.users.googleNonce, {
      method: 'POST',
      headers: { origin },
    })
    expect(challenge.status).toBe(200)
    expect(challenge.headers.get('set-cookie')).toContain('HttpOnly')
    expect(challenge.headers.get('cache-control')).toBe('no-store')
    const { nonce } = (await challenge.json()) as { nonce: string }
    const cookie = challenge.headers.get('set-cookie')!.split(';')[0]!
    const response = await app.request(API.users.google, {
      method: 'POST',
      headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ credential: credential('unused', { nonce }) }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      accessToken: 'bookshop-access',
      firstName: 'Reader',
    })
    const refreshCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${REFRESH_TOKEN}=`))
    expect(refreshCookie).toContain('HttpOnly')
    expect(refreshCookie).toContain('Path=/api/users/refresh')
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  it.each(['https://attacker.example', ''])(
    'rejects an untrusted origin: %s',
    async (untrusted) => {
      const response = await app.request(API.users.google, {
        method: 'POST',
        headers: { origin: untrusted, 'content-type': 'application/json' },
        body: '{}',
      })
      expect(response.status).toBe(403)
      expect(certificates).not.toHaveBeenCalled()
      const challenge = await app.request(API.users.googleNonce, {
        method: 'POST',
        headers: { origin: untrusted },
      })
      expect(challenge.status).toBe(403)
    },
  )

  it.each(['', `${GOOGLE_AUTH_SESSION}=forged`])(
    'rejects a missing or forged challenge: %s',
    async (cookie) => {
      const response = await app.request(API.users.google, {
        method: 'POST',
        headers: { origin, cookie, 'content-type': 'application/json' },
        body: '{}',
      })
      expect(response.status).toBe(401)
      expect(certificates).not.toHaveBeenCalled()
    },
  )

  it('rejects an expired Bun nonce even when the browser cookie is valid', async () => {
    const sessionId = 'test-browser'
    const nonce = Bun.CSRF.generate(env.cookieSecret, {
      sessionId,
      expiresIn: 1,
    })
    await Bun.sleep(10)
    const response = await app.request(API.users.google, {
      method: 'POST',
      headers: {
        origin,
        cookie: await challengeCookie(sessionId),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ credential: credential(sessionId, { nonce }) }),
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: 'INVALID_TOKEN' })
    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
    expect(mockSignAccessToken).not.toHaveBeenCalled()
  })

  it('rejects a valid Google nonce presented by another browser', async () => {
    const challenge = await app.request(API.users.googleNonce, {
      method: 'POST',
      headers: { origin },
    })
    const { nonce } = (await challenge.json()) as { nonce: string }
    const response = await app.request(API.users.google, {
      method: 'POST',
      headers: {
        origin,
        cookie: await challengeCookie('another-browser'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ credential: credential('unused', { nonce }) }),
    })

    expect(response.status).toBe(401)
    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
    expect(mockSignAccessToken).not.toHaveBeenCalled()
  })

  it('rejects an unbound nonce even with a valid browser cookie', async () => {
    const nonce = Bun.CSRF.generate(env.cookieSecret, {
      expiresIn: authTiming.googleNonceMs,
    })
    const response = await app.request(API.users.google, {
      method: 'POST',
      headers: {
        origin,
        cookie: await challengeCookie('browser-session'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ credential: credential('unused', { nonce }) }),
    })

    expect(response.status).toBe(401)
    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
  })

  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    '',
    'application/jsonp',
    'text/plain; note=application/json',
  ])('rejects non-JSON login requests: %s', async (contentType) => {
    const response = await app.request(API.users.google, {
      method: 'POST',
      headers: { origin, 'content-type': contentType },
      body: '{}',
    })

    expect(response.status).toBe(403)
    expect(certificates).not.toHaveBeenCalled()
  })
})
