import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { sign } from 'hono/jwt'
import { env } from '@/config'
import { type User, UserRole } from '@/types'
import {
  mockOrdersDB,
  mockUploadFile,
  mockUsersDB,
  mockValidate,
} from './test-setup'

const { app } = await import('@/app')
const previousSecret = env.jwtAccessSecret
const account: User = {
  id: 1,
  uuid: 'user-uuid',
  firstName: 'Reader',
  lastName: 'One',
  email: 'reader@example.com',
  country: 'HU',
  role: UserRole.User,
  password: 'stored-password-hash',
  phone: null,
  avatar: null,
  address: null,
  verified: true,
  verificationToken: 'internal-verification-token',
  verificationExpires: new Date(),
  passwordResetToken: 'internal-reset-token',
  passwordResetExpires: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
}

beforeEach(() => {
  env.jwtAccessSecret = 'auth-request-context-test-secret'
  mockValidate
    .mockReset()
    .mockImplementation(
      (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
        schema.parse(value),
    )
  mockUsersDB.getActiveUserBy.mockReset().mockResolvedValue(account)
  mockUsersDB.updateUserBy.mockReset().mockResolvedValue(account)
  mockUsersDB.getAllUsers.mockReset().mockResolvedValue([account])
  mockOrdersDB.getOrdersByEmail.mockReset().mockResolvedValue([])
  mockUploadFile
    .mockReset()
    .mockResolvedValue('https://bookshop.test/avatar.png')
})

afterEach(() => {
  env.jwtAccessSecret = previousSecret
  mockValidate.mockReset()
})

async function request(path: string, options: RequestInit = {}) {
  const token = await sign(
    { uuid: account.uuid, exp: Math.floor(Date.now() / 1000) + 60 },
    env.jwtAccessSecret!,
    'HS256',
  )

  return await app.request('/api' + path, {
    ...options,
    headers: { authorization: 'Bearer ' + token, ...options.headers },
  })
}

describe('authentication request context', () => {
  it('loads a profile once and excludes internal account fields from the response', async () => {
    const response = await request('/users/profile')
    const profile = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(profile.email).toBe(account.email)
    expect(profile.uuid).toBe(account.uuid)
    for (const field of [
      'password',
      'verificationToken',
      'verificationExpires',
      'passwordResetToken',
      'passwordResetExpires',
      'id',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ]) {
      expect(profile).not.toHaveProperty(field)
    }
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledWith(
      'uuid',
      account.uuid,
    )
  })

  it('reuses the loaded account for orders', async () => {
    const response = await request('/orders')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([])
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
    expect(mockOrdersDB.getOrdersByEmail).toHaveBeenCalledWith(account.email)
  })

  it('updates the loaded account by its stable UUID without another lookup', async () => {
    mockUsersDB.updateUserBy.mockResolvedValueOnce({
      ...account,
      firstName: 'Updated',
    })
    const response = await request('/users/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Updated' }),
    })
    const profile = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(profile.firstName).toBe('Updated')
    expect(profile).not.toHaveProperty('password')
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
    expect(mockUsersDB.updateUserBy).toHaveBeenCalledWith(
      'uuid',
      account.uuid,
      { firstName: 'Updated' },
    )
  })

  it('reuses the loaded account for avatar uploads', async () => {
    const avatar = new File(['image'], 'avatar.png', { type: 'image/png' })
    const body = new FormData()
    body.set('avatar', avatar)
    mockUsersDB.updateUserBy.mockResolvedValueOnce({
      ...account,
      avatar: 'https://bookshop.test/avatar.png',
    })
    const response = await request('/users/avatar', { method: 'POST', body })

    expect(response.status).toBe(200)
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
    expect(mockUploadFile).toHaveBeenCalledTimes(1)
    expect(mockUsersDB.updateUserBy).toHaveBeenCalledWith(
      'uuid',
      account.uuid,
      { avatar: 'https://bookshop.test/avatar.png' },
    )
    expect(await response.json()).not.toHaveProperty('password')
  })

  it('reuses the same authentication lookup for admin authorization', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
      ...account,
      role: UserRole.Admin,
    })
    const response = await request('/cms/users')

    expect(response.status).toBe(200)
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
    expect(mockUsersDB.getAllUsers).toHaveBeenCalledTimes(1)
  })

  it('rejects missing or deleted accounts before executing a protected handler', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)
    const response = await request('/orders')

    expect(response.status).toBe(401)
    expect(mockUsersDB.getActiveUserBy).toHaveBeenCalledTimes(1)
    expect(mockOrdersDB.getOrdersByEmail).not.toHaveBeenCalled()
  })

  it('rejects an invalid token before looking up an account', async () => {
    const response = await app.request('/api/users/profile', {
      headers: { authorization: 'Bearer invalid-token' },
    })

    expect(response.status).toBe(401)
    expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
  })

  it.each([undefined, 'Bearer invalid-token'])(
    'clears logout cookies without authenticating: %s',
    async (authorization) => {
      mockUsersDB.getActiveUserBy.mockResolvedValue(null)
      const response = await app.request('/api/users/logout', {
        method: 'POST',
        headers: authorization ? { authorization } : {},
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ success: true })
      const cookies = response.headers.getSetCookie()
      expect(cookies).toHaveLength(2)
      expect(cookies[0]).toContain('refresh_token=;')
      expect(cookies[0]).toContain('Max-Age=0')
      expect(cookies[1]).toContain('payment_session=;')
      expect(cookies[1]).toContain('Max-Age=0')
      expect(mockUsersDB.getActiveUserBy).not.toHaveBeenCalled()
    },
  )
})
