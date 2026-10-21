import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { setSignedCookie } from 'hono/cookie'
import { cookieOptions, env, REFRESH_TOKEN } from '@/config'
import { API } from '@/constants'
import { errorHandler } from '@/errors/errorHandler'
import { UserRole } from '@/types'
import {
  mockSignAccessToken,
  mockSignRefreshToken,
  mockUsersDB,
  mockVerifyJWTRefresh,
} from './test-setup'

const { users } = await import('@/controller/users.controller')
const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .route('/', users)
const previousCookieSecret = env.cookieSecret
const timestamp = () => Math.floor(Date.now() / 1000)
const account = {
  uuid: 'user-uuid',
  firstName: 'Test',
  lastName: 'User',
  email: 'test@example.com',
  country: 'hu',
  role: UserRole.User,
  avatar: null,
  address: null,
  phone: null,
}

const refreshWithCookie = async () => {
  const cookieIssuer = new Hono().get('/', async (c) => {
    await setSignedCookie(
      c,
      REFRESH_TOKEN,
      'old-refresh-token',
      env.cookieSecret!,
      cookieOptions,
    )

    return c.text('')
  })
  const cookieResponse = await cookieIssuer.request('/')
  const cookie = cookieResponse.headers.get('set-cookie')!.split(';')[0]!

  return app.request(API.users.refresh, {
    method: 'POST',
    headers: { cookie },
  })
}

beforeEach(() => {
  env.cookieSecret = 'test-cookie-secret-for-refresh'
  mockUsersDB.getActiveUserBy.mockReset()
  mockSignAccessToken.mockReset().mockResolvedValue('new-access-token')
  mockSignRefreshToken.mockReset().mockResolvedValue('new-refresh-token')
  mockVerifyJWTRefresh.mockReset().mockResolvedValue({
    uuid: account.uuid,
    exp: timestamp() + 14 * 86400,
    iat: timestamp(),
  })
})

afterEach(() => {
  env.cookieSecret = previousCookieSecret
})

describe('session refresh', () => {
  it('returns a language-independent error for invalid login credentials', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)
    const response = await app.request(API.users.login, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'missing@example.com',
        password: 'password1',
      }),
    })

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ code: 'INVALID_CREDENTIALS' })
  })

  it('discards a deleted account before issuing or rotating tokens', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)
    mockVerifyJWTRefresh.mockResolvedValueOnce({
      uuid: account.uuid,
      exp: timestamp() + 86400,
      iat: timestamp(),
    })
    const response = await refreshWithCookie()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accessToken: null })
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith(
      'uuid',
      account.uuid,
    )
    expect(mockSignAccessToken).not.toHaveBeenCalled()
    expect(mockSignRefreshToken).not.toHaveBeenCalled()
  })

  it('refreshes an existing account without returning its profile', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(account)
    const response = await refreshWithCookie()

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ accessToken: 'new-access-token' })
    expect(mockSignAccessToken).toHaveBeenCalledWith(
      account.uuid,
      expect.any(Number),
    )
    expect(mockSignRefreshToken).not.toHaveBeenCalled()
  })

  it('keeps refresh-token rotation for an existing account near expiry', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(account)
    mockVerifyJWTRefresh.mockResolvedValueOnce({
      uuid: account.uuid,
      exp: timestamp() + 86400,
      iat: timestamp(),
    })
    const response = await refreshWithCookie()

    expect(response.status).toBe(200)
    expect(mockSignRefreshToken).toHaveBeenCalledWith(
      account.uuid,
      expect.any(Number),
    )
    expect(response.headers.get('set-cookie')).toContain(REFRESH_TOKEN)
    expect(response.headers.get('set-cookie')).not.toContain('Max-Age=0')
  })

  it('preserves the cookie when the account lookup fails temporarily', async () => {
    mockUsersDB.getActiveUserBy.mockRejectedValueOnce(
      new Error('Database offline'),
    )
    const response = await refreshWithCookie()

    expect(response.status).toBe(500)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(mockSignAccessToken).not.toHaveBeenCalled()
    expect(mockSignRefreshToken).not.toHaveBeenCalled()
  })
})
