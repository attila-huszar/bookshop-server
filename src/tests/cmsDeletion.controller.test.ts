import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { env } from '@/config'
import { errorHandler } from '@/errors/errorHandler'
import { type Order, UserRole } from '@/types'
import {
  mockBooksDB,
  mockOrdersDB,
  mockUsersDB,
  mockValidate,
} from './test-setup'

const { cms } = await import('@/controller/cms.controller')
const { authAdminMiddleware } =
  await import('@/middleware/authAdmin.middleware')
const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .use('/api/cms/*', authAdminMiddleware)
  .route('/api', cms)
const { authMiddleware } = await import('@/middleware/auth.middleware')
const privateApp = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .use('/private', authMiddleware)
  .get('/private', (c) => c.json({ accessible: true }))
const previousSecret = env.jwtAccessSecret
const order: Order = {
  id: 1,
  paymentId: 'pi_deleted',
  checkoutRequestId: 'checkout-deleted',
  termsAcceptance: null,
  paymentStatus: 'succeeded',
  total: 10,
  currency: 'USD',
  items: [],
  firstName: null,
  lastName: null,
  email: 'reader@example.com',
  shipping: null,
  paidAt: new Date('2026-10-08T10:00:00Z'),
  createdAt: new Date('2026-10-08T09:00:00Z'),
  updatedAt: new Date('2026-10-08T12:00:00Z'),
  lastStripeEventCreated: null,
  lastStripeEventId: null,
  lastReconciledAt: null,
  lastReconciliationAttemptAt: null,
  reconciliationFailures: 0,
  reconciliationAlertId: null,
  deletedAt: new Date('2026-10-08T12:00:00Z'),
}

beforeEach(() => {
  env.jwtAccessSecret = 'cms-soft-delete-test-secret'
  mockValidate
    .mockReset()
    .mockImplementation(
      (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
        schema.parse(value),
    )
  mockUsersDB.getActiveUserBy
    .mockReset()
    .mockResolvedValue({ uuid: 'admin', role: UserRole.Admin })
  mockOrdersDB.setOrdersDeleted.mockReset().mockResolvedValue(1)
  mockOrdersDB.getAllOrders.mockReset().mockResolvedValue([order])
  mockUsersDB.getAllUsers.mockReset().mockResolvedValue([
    { id: 1, role: UserRole.Admin, deletedAt: null },
    { id: 2, role: UserRole.User, deletedAt: null },
    { id: 3, role: UserRole.Admin, deletedAt: new Date() },
  ])
  mockUsersDB.setUsersDeleted.mockReset().mockResolvedValue(1)
  mockBooksDB.hardDeleteBooks.mockReset().mockResolvedValue([1])
})

afterEach(() => {
  env.jwtAccessSecret = previousSecret
  mockValidate.mockReset()
})

async function request(path: string, method: string, body?: unknown) {
  const token = await sign(
    { uuid: 'admin', exp: Math.floor(Date.now() / 1000) + 60 },
    env.jwtAccessSecret!,
    'HS256',
  )

  return await app.request(path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

describe('CMS soft-delete contract', () => {
  it.each([
    ['orders', 'orderIds', 'DELETE', '/api/cms/orders', true],
    ['orders', 'orderIds', 'PATCH', '/api/cms/restore/orders', false],
    ['users', 'userIds', 'DELETE', '/api/cms/users', true],
    ['users', 'userIds', 'PATCH', '/api/cms/restore/users', false],
  ] as const)(
    'soft deletes/restores %s with %s through %s %s',
    async (entity, key, method, path, deleted) => {
      const id = entity === 'users' ? 2 : 1
      const response = await request(path, method, { [key]: [id] })

      expect(response.status).toBe(200)
      expect(await response.json()).toBe(1)
      expect(
        entity === 'orders'
          ? mockOrdersDB.setOrdersDeleted
          : mockUsersDB.setUsersDeleted,
      ).toHaveBeenCalledWith([id], deleted)
    },
  )

  it.each([
    ['/api/cms/orders', 'DELETE'],
    ['/api/cms/restore/orders', 'PATCH'],
    ['/api/cms/users', 'DELETE'],
    ['/api/cms/restore/users', 'PATCH'],
  ])('requires an authenticated admin for %s %s', async (path, method) => {
    expect((await app.request(path, { method })).status).toBe(401)
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
      uuid: 'reader',
      role: UserRole.User,
    })
    expect((await request(path, method, {})).status).toBe(403)
    expect(mockOrdersDB.setOrdersDeleted).not.toHaveBeenCalled()
    expect(mockUsersDB.setUsersDeleted).not.toHaveBeenCalled()
  })

  it.each([
    ['orders', 'orderIds'],
    ['users', 'userIds'],
  ] as const)(
    'rejects malformed %s commands before writing',
    async (entity, key) => {
      for (const body of [
        {},
        { [key]: [] },
        { [key]: [0] },
        { [key]: ['invalid'] },
        { [key]: [1], deletedAt: '2030-01-01' },
        { [key]: [1], archived: true },
        { [key]: [1], paymentStatus: 'canceled' },
      ]) {
        expect(
          (await request('/api/cms/' + entity, 'DELETE', body)).status,
        ).toBe(400)
        expect(
          (await request('/api/cms/restore/' + entity, 'PATCH', body)).status,
        ).toBe(400)
      }

      expect(mockOrdersDB.setOrdersDeleted).not.toHaveBeenCalled()
      expect(mockUsersDB.setUsersDeleted).not.toHaveBeenCalled()
    },
  )

  it('counts only active admins when protecting the last admin', async () => {
    expect(
      (await request('/api/cms/users', 'DELETE', { userIds: [1, 3] })).status,
    ).toBe(400)
    expect(mockUsersDB.setUsersDeleted).not.toHaveBeenCalled()

    mockUsersDB.getAllUsers.mockResolvedValueOnce([
      { id: 1, role: UserRole.Admin, deletedAt: null },
      { id: 3, role: UserRole.Admin, deletedAt: null },
    ])
    expect(
      (await request('/api/cms/users', 'DELETE', { userIds: [1] })).status,
    ).toBe(200)
    expect(mockUsersDB.setUsersDeleted).toHaveBeenCalledWith([1], true)
  })

  it('rejects a deleted account even with a valid access token', async () => {
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)
    expect(
      (await request('/api/cms/orders', 'DELETE', { orderIds: [1] })).status,
    ).toBe(401)
    expect(mockOrdersDB.setOrdersDeleted).not.toHaveBeenCalled()

    mockUsersDB.getActiveUserBy.mockResolvedValueOnce(null)
    const token = await sign(
      { uuid: 'deleted-user', exp: Math.floor(Date.now() / 1000) + 60 },
      env.jwtAccessSecret!,
      'HS256',
    )
    const response = await privateApp.request('/private', {
      headers: { authorization: 'Bearer ' + token },
    })

    expect(response.status).toBe(401)
    expect(await response.json()).not.toHaveProperty('accessible')
  })

  it('keeps hard deletion for catalogue entries', async () => {
    const response = await request('/api/cms/books', 'DELETE', { bookIds: [1] })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([1])
    expect(mockBooksDB.hardDeleteBooks).toHaveBeenCalledWith([1])
  })

  it('includes soft-delete metadata for CMS views while excluding internal payment bookkeeping', async () => {
    const response = await request('/api/cms/orders', 'GET')
    const body = (await response.json()) as { deletedAt: string }[]

    expect(response.status).toBe(200)
    expect(body[0]?.deletedAt).toBe(order.deletedAt?.toISOString())
    expect(body[0]).not.toHaveProperty('checkoutRequestId')
    expect(body[0]).not.toHaveProperty('reconciliationFailures')
    expect(body[0]).not.toHaveProperty('reconciliationAlertId')
  })
})
