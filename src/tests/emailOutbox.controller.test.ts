import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Hono } from 'hono'
import { sign } from 'hono/jwt'
import { env } from '@/config'
import { emailOutboxQuerySchema } from '@/validation/emailOutboxQuerySchema'
import { emailOutboxResponse } from '@/utils/email-outbox.utils'
import { errorHandler } from '@/errors/errorHandler'
import { AdminNotification, type EmailOutboxEntry, UserRole } from '@/types'
import { mockOutboxDB, mockUsersDB, mockValidate } from './test-setup'

const { cms } = await import('@/controller/cms.controller')
const { authAdminMiddleware } =
  await import('@/middleware/authAdmin.middleware')

const app = new Hono()
  .onError((error, c) => errorHandler(c, error))
  .use('/api/cms/*', authAdminMiddleware)
  .route('/api', cms)
const previousSecret = env.jwtAccessSecret
const now = new Date('2026-10-07T12:00:00Z')
const entry: EmailOutboxEntry = {
  id: 'verification-safe-id',
  payload: {
    type: 'verification',
    toAddress: 'reader@example.com',
    toName: 'Reader',
    tokenLink: 'https://example.com/verify?token=secret-token',
  },
  createdAt: now,
  availableAt: now,
  attempts: 1,
  leaseToken: 'private-lease',
  lockedUntil: null,
  processedAt: now,
  lastError: null,
  deliveryStatus: 'sent',
  deliveryAttempts: 1,
  deliveryUpdatedAt: now,
  deliveryNextAttemptAt: null,
  deliveryError: null,
}

beforeEach(() => {
  env.jwtAccessSecret = 'email-outbox-test-secret'
  mockValidate
    .mockReset()
    .mockImplementation(
      (schema: { parse: (value: unknown) => unknown }, value: unknown) =>
        schema.parse(value),
    )
  mockOutboxDB.getEmailOutbox
    .mockReset()
    .mockResolvedValue({ entries: [entry], total: 1 })
  mockUsersDB.getActiveUserBy.mockReset().mockResolvedValue({
    uuid: 'admin',
    email: 'admin@example.com',
    role: UserRole.Admin,
  })
})

afterEach(() => {
  env.jwtAccessSecret = previousSecret
  mockValidate.mockReset()
})

async function getOutbox(query = '') {
  const token = await sign(
    { uuid: 'admin', exp: Math.floor(Date.now() / 1000) + 60 },
    env.jwtAccessSecret!,
    'HS256',
  )

  return app.request(`/api/cms/email-outbox${query}`, {
    headers: { authorization: `Bearer ${token}` },
  })
}

describe('CMS email outbox contract', () => {
  it('validates and forwards the exact order payment ID', async () => {
    const response = await getOutbox('?paymentId=pi_test')

    expect(response.status).toBe(200)
    expect(mockOutboxDB.getEmailOutbox).toHaveBeenCalledWith(
      { page: 1, limit: 25, paymentId: 'pi_test' },
      expect.any(Date),
    )
  })
  it('requires authentication and an admin account before reading the outbox', async () => {
    expect((await app.request('/api/cms/email-outbox')).status).toBe(401)
    mockUsersDB.getActiveUserBy.mockResolvedValueOnce({
      uuid: 'reader',
      email: 'reader@example.com',
      role: UserRole.User,
    })
    expect((await getOutbox()).status).toBe(403)
    expect(mockOutboxDB.getEmailOutbox).not.toHaveBeenCalled()
  })

  it('returns a paginated summary without payloads, account links, or lease tokens', async () => {
    const response = await getOutbox(
      '?page=2&limit=10&type=verification&status=sent&search=%20reader%20',
    )
    const body = (await response.json()) as {
      entries: ReturnType<typeof emailOutboxResponse>[]
      total: number
      page: number
      limit: number
    }

    expect(response.status).toBe(200)
    expect(body).toEqual({
      entries: [emailOutboxResponse(entry, now)],
      total: 1,
      page: 2,
      limit: 10,
    })
    expect(mockOutboxDB.getEmailOutbox).toHaveBeenCalledWith(
      {
        page: 2,
        limit: 10,
        type: 'verification',
        status: 'sent',
        search: 'reader',
      },
      expect.any(Date),
    )
    expect(JSON.stringify(body)).not.toContain('secret-token')
    expect(JSON.stringify(body)).not.toContain('private-lease')
    expect(body.entries[0]).not.toHaveProperty('payload')
  })

  it('uses defaults and rejects malformed or excessive pagination and unknown filters', async () => {
    expect(emailOutboxQuerySchema.parse({})).toEqual({ page: 1, limit: 25 })

    for (const query of [
      '?page=0',
      '?page=-1',
      '?page=1.5',
      '?page=10001',
      '?limit=101',
      '?limit=',
      '?status=delivered',
      '?type=unknown',
      '?payload=1',
      '?paymentId=',
      '?paymentId=invalid',
      `?paymentId=pi_${'a'.repeat(201)}`,
      `?search=${'a'.repeat(201)}`,
    ]) {
      expect((await getOutbox(query)).status).toBe(400)
    }

    expect(mockOutboxDB.getEmailOutbox).not.toHaveBeenCalled()
  })

  it('sanitizes stored errors and keeps historical processed outcomes unknown', () => {
    const response = emailOutboxResponse(
      {
        ...entry,
        deliveryStatus: null,
        lastError: 'smtp credentials=secret-token',
      },
      now,
    )

    expect(response.status).toBe('processed')
    expect(response.nextAttemptAt).toBeNull()
    expect(response.lastError).toBe('Email publication failed')
    expect(JSON.stringify(response)).not.toContain('secret-token')
  })

  it('exposes a reconciliation reason without incident bookkeeping or email content', () => {
    const response = emailOutboxResponse(
      {
        ...entry,
        payload: {
          type: 'adminPaymentNotification',
          notificationType: AdminNotification.Error,
          toAddress: 'admin@example.com',
          emailTitle: 'Reconciliation failed',
          paymentId: 'pi_test',
          customerName: 'Reader',
          customerEmail: 'reader@example.com',
          total: 12.34,
          currency: 'USD',
          items: [],
          shippingAddress: '',
          paymentStatus: 'succeeded',
          reconciliation: {
            alertId: 'private-alert-id',
            reason: 'Stripe payment amount differs from the order',
            orderId: 1,
            failures: 3,
            liveMode: false,
          },
        },
      },
      now,
    )
    expect(response.failureReason).toBe(
      'Stripe payment amount differs from the order',
    )
    expect(JSON.stringify(response)).not.toContain('private-alert')
    expect(response).not.toHaveProperty('payload')
  })
})
